//TODO Adding an extra Guard deck will reshuffle the first one, End of round with multiple Archers, resize text, worth to show common and elite_only attributes?, shield and retaliate only when shown (apparently, attribtues are active at the beginning of the turn, and active after initiative)
var do_shuffles = true;
var visible_ability_decks = [];
var modifier_deck = null;
var deck_definitions = load_definition(DECK_DEFINITONS);

// scaling factor for card container width
var DEFAULT_CARD_SIZE_FACTOR = 1;
var card_size_factor =
  parseFloat(localStorage.getItem("card_size_factor")) ||
  DEFAULT_CARD_SIZE_FACTOR;

var draw_animation_enabled =
  localStorage.getItem("draw_animation_enabled") !== "false";

var SHUFFLE_ANIMATION_TIME = 600; // ms, keep in sync with CSS

var DECK_TYPES = {
  MODIFIER: "modifier",
  ABILITY: "ability",
  BOSS: "boss",
};

var EVENT_NAMES = {
  MODIFIER_CARD_DRAWN: "modifierCardDrawn",
  MODIFIER_DECK_SHUFFLE_REQUIRED: "modfierDeckShuffleRequired",
};

function UICard(front_element, back_element) {
  var card = {};

  card.back = back_element;
  card.front = front_element;

  card.flip_up = function (faceup) {
    toggle_class(this.back, "up", !faceup);
    toggle_class(this.back, "down", faceup);

    toggle_class(this.front, "up", faceup);
    toggle_class(this.front, "down", !faceup);
  };

  card.set_depth = function (z) {
    this.back.style.zIndex = z;
    this.front.style.zIndex = z;
  };

  card.push_down = function () {
    this.back.style.zIndex -= 1;
    this.front.style.zIndex -= 1;
  };

  card.addClass = function (class_name) {
    this.front.classList.add(class_name);
    this.back.classList.add(class_name);
  };

  card.removeClass = function (class_name) {
    this.front.classList.remove(class_name);
    this.back.classList.remove(class_name);
  };

  card.attach = function (parent) {
    parent.appendChild(this.back);
    parent.appendChild(this.front);
  };

  card.flip_up(false);

  return card;
}

function create_ability_card_back(name, level) {
  var card = document.createElement("div");
  card.className = "card ability back down";

  var name_span = document.createElement("span");
  name_span.className = "name";
  name_span.innerText = name + "-" + level;
  card.appendChild(name_span);

  return card;
}

function create_ability_card_front(
  initiative,
  name,
  shuffle,
  lines,
  attack,
  move,
  range,
  level,
  health
) {
  var card = document.createElement("div");
  card.className = "card ability front down";

  var name_span = document.createElement("span");
  name_span.className = "name";
  name_span.innerText = name + "-" + level;
  card.appendChild(name_span);

  var healthNormal_span = document.createElement("span");
  healthNormal_span.className = "healthNormal";
  healthNormal_span.innerText = "HP " + health[0];
  card.appendChild(healthNormal_span);

  if (health[1] > 0) {
    var healthElite_span = document.createElement("span");
    healthElite_span.className = "healthElite";
    healthElite_span.innerText = "HP " + health[1];
    card.appendChild(healthElite_span);
  }

  var initiative_span = document.createElement("span");
  initiative_span.className = "initiative";
  initiative_span.innerText = initiative;
  card.appendChild(initiative_span);

  if (shuffle) {
    var shuffle_img = document.createElement("img");
    shuffle_img.src = "images/shuffle.svg";
    card.appendChild(shuffle_img);
  }

  var current_depth = 0;
  var current_parent = card;

  lines = remove_empty_strings(lines);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    var new_depth = 0;
    while (line.indexOf("*") >= 0) {
      new_depth += 1;
      line = line.substr(1);
    }
    var diff = new_depth - current_depth;

    while (current_depth != new_depth) {
      if (diff > 0) {
        // Need one level lower, create <ul>
        var list = document.createElement("ul");
        // Dynamically adapt the size to the line length. I found this the sweet spot to read all the cards
        if (lines.length > 5) {
          list.style.fontSize = 100 - lines.length * 2.5 + "%";
        }
        current_parent.appendChild(list);
        current_parent = list;

        // Create <li>
        var list_item = document.createElement("li");
        current_parent.appendChild(list_item);
        current_parent = list_item;

        current_depth += 1;
      } else {
        // Need to go up in the list, pop <li>
        current_parent = current_parent.parentElement;

        // pop <ul>
        current_parent = current_parent.parentElement;

        current_depth -= 1;
      }
    }

    if (current_depth > 0 && diff <= 0) {
      // Same level, pop the previous <li>
      current_parent = current_parent.parentElement;

      // create sibling <li>
      var list_item = document.createElement("li");
      current_parent.appendChild(list_item);
      current_parent = list_item;
    }

    var text = expand_string(line.trim(), attack, move, range);
    current_parent.insertAdjacentHTML("beforeend", text);
  }

  return card;
}

function load_ability_deck(deck_class, deck_name, level) {
  var deck_definition = deck_definitions[deck_class];
  deck_definition.name = deck_name;
  deck_definition.level = level;

  var loaded_deck = JSON.parse(get_from_storage(deck_name));

  var deck = {
    class: deck_definition.class,
    name: deck_definition.name,
    type: DECK_TYPES.ABILITY,
    draw_pile: [],
    discard: [],
    move: [0, 0],
    attack: [0, 0],
    range: [0, 0],
    level: deck_definition.level,
    health: [0, 0],
  };

  for (var i = 0; i < deck_definition.cards.length; i++) {
    var definition = deck_definition.cards[i];
    var shuffle = definition[0];
    var initiative = definition[1];
    var lines = definition.slice(2);

    var empty_front = document.createElement("div");
    empty_front.className = "card ability front down";
    var card_front = empty_front;
    var card_back = create_ability_card_back(deck.name, deck.level);

    var card = {
      id: deck.name + "_" + i,
      ui: new UICard(card_front, card_back),
      shuffle_next: shuffle,
      initiative: initiative,
      starting_lines: lines,
    };

    card.paint_front_card = function (
      name,
      lines,
      attack,
      move,
      range,
      level,
      health
    ) {
      this.ui.front = create_ability_card_front(
        this.initiative,
        name,
        this.shuffle_next,
        lines,
        attack,
        move,
        range,
        level,
        health
      );
    };
    if (loaded_deck && find_in_discard(loaded_deck.discard, card.id)) {
      deck.discard.push(card);
    } else {
      deck.draw_pile.push(card);
    }
  }
  deck.draw_top_discard = function () {
    if (this.discard.length > 0) {
      var card = this.discard[this.discard.length - 1];
      var cards_lines = card.starting_lines;
      var extra_lines = [];
      if (this.is_boss()) {
        var new_lines = [];
        cards_lines.forEach(function (line) {
          new_lines = new_lines.concat(
            special_to_lines(line, deck.special1, deck.special2)
          );
        });
        cards_lines = new_lines;
        if (this.immunities) {
          extra_lines = extra_lines.concat(
            immunities_to_lines(this.immunities)
          );
        }
        if (this.notes) {
          extra_lines = extra_lines.concat(notes_to_lines(this.notes));
        }
      } else {
        if (this.attributes) {
          extra_lines = extra_lines.concat(
            attributes_to_lines(this.attributes)
          );
        }
      }

      card.paint_front_card(
        this.get_real_name(),
        cards_lines.concat(extra_lines),
        this.attack,
        this.move,
        this.range,
        this.level,
        this.health
      );

      card.ui.set_depth(-3);
      if (draw_animation_enabled) {
        card.ui.addClass("pull");
      } else {
        card.ui.removeClass("pull");
      }
      card.ui.flip_up(true);
      card.ui.removeClass("draw");
      card.ui.addClass("discard");
    }
    force_repaint_deck(this);
  };

  deck.draw_top_card = function () {
    var cards_lines = this.draw_pile[0].starting_lines;
    var extra_lines = [];
    if (this.is_boss()) {
      var new_lines = [];
      cards_lines.forEach(function (line) {
        new_lines = new_lines.concat(
          special_to_lines(line, deck.special1, deck.special2)
        );
      });
      cards_lines = new_lines;
      if (this.immunities) {
        extra_lines = extra_lines.concat(immunities_to_lines(this.immunities));
      }
      if (this.notes) {
        extra_lines = extra_lines.concat(notes_to_lines(this.notes));
      }
    } else {
      if (this.attributes) {
        extra_lines = extra_lines.concat(attributes_to_lines(this.attributes));
      }
    }

    this.draw_pile[0].paint_front_card(
      this.get_real_name(),
      cards_lines.concat(extra_lines),
      this.attack,
      this.move,
      this.range,
      this.level,
      this.health
    );
    force_repaint_deck(this);
  };

  deck.must_reshuffle = function () {
    if (!this.draw_pile.length) {
      return true;
    } else {
      if (do_shuffles && this.discard.length) {
        return this.discard[0].shuffle_next;
      }
    }
  };

  deck.set_stats_monster = function (stats) {
    this.attack = stats.attack;
    this.move = stats.move;
    this.range = stats.range;
    this.attributes = stats.attributes;
    this.health = stats.health;
  };

  deck.set_stats_boss = function (stats) {
    this.attack = stats.attack;
    this.move = stats.move;
    this.range = stats.range;
    this.special1 = stats.special1;
    this.special2 = stats.special2;
    this.immunities = stats.immunities;
    this.notes = stats.notes;
    this.health = stats.health;
  };

  deck.get_real_name = function () {
    return this.name ? this.name : this.class;
  };

  deck.is_boss = function () {
    return this.class == DECKS["Boss"].class;
  };

  deck.set_card_piles = function (draw_pile, discard_pile) {
    var i;
    for (i = 0; i < draw_pile.length; i++) {
      this.draw_pile[i].shuffle_next = draw_pile[i].shuffle_next;
      this.draw_pile[i].initiative = draw_pile[i].initiative;
      this.draw_pile[i].starting_lines = draw_pile[i].starting_lines;
    }
    for (i = 0; i < discard_pile.length; i++) {
      this.discard[i].shuffle_next = discard_pile[i].shuffle_next;
      this.discard[i].initiative = discard_pile[i].initiative;
      this.discard[i].starting_lines = discard_pile[i].starting_lines;
    }
  };

  write_to_storage(deck.name, JSON.stringify(deck));
  return deck;
}

function place_deck(deck, container) {
  var i;
  var card;
  for (i = 0; i < deck.draw_pile.length; i++) {
    card = deck.draw_pile[i];
    card.ui.attach(container);
  }
  for (i = 0; i < deck.discard.length; i++) {
    card = deck.discard[i];
    card.ui.attach(container);
  }
  deck.deck_space = container;
}

function force_repaint_deck(deck) {
  prevent_pull_animation(deck);
  var space = deck.deck_space;
  remove_child(space);
  place_deck(deck, space);
}

function update_card_size() {
  // Only resize monster ability decks and not the modifier deck
  var containers = document.querySelectorAll(".card-container");
  var base_width = 453; // default width in CSS
  for (var i = 0; i < containers.length; i++) {
    var c = containers[i];
    if (
      c.className.indexOf("modifier") !== -1 ||
      c.id === "modifier-container"
    ) {
      continue;
    }
    c.style.width = base_width * card_size_factor + "px";
  }
  localStorage.setItem("card_size_factor", card_size_factor);
  var indicator = document.getElementById("cardsizevalue");
  if (indicator) {
    indicator.textContent = Math.round(card_size_factor * 100) + "%";
  }
  refresh_ui();
}

// This should be dynamic dependant on lines per card
function refresh_ui() {
  var actual_card_height = 296;
  var base_font_size = 26.6;

  var tableau = document.getElementById("tableau");
  var cards = tableau.getElementsByClassName("card");
  for (var i = 1; i < cards.length; i++) {
    if (cards[i].className.indexOf("ability") !== -1) {
      var scale = cards[i].getBoundingClientRect().height / actual_card_height;
      var scaled_font_size = base_font_size * scale;
      tableau.style.fontSize = scaled_font_size + "px";
      break;
    }
  }
}

function reshuffle(deck, include_discards) {
  shuffle_deck(deck, include_discards);

  // This way we keep sync several decks from the same class
  visible_ability_decks.forEach(function (visible_deck) {
    if (visible_deck !== deck && visible_deck.class == deck.class) {
      shuffle_deck(visible_deck, include_discards);
      visible_deck.set_card_piles(deck.draw_pile, deck.discard);
    }
  });
}

function shuffle_deck(deck, include_discards) {
  if (include_discards) {
    deck.draw_pile = deck.draw_pile.concat(deck.discard);
    deck.discard = [];
  }

  shuffle_list(deck.draw_pile);

  for (var i = 0; i < deck.draw_pile.length; i++) {
    var card = deck.draw_pile[i];

    card.ui.removeClass("lift");
    card.ui.removeClass("pull");

    card.ui.flip_up(false);

    card.ui.removeClass("discard");
    card.ui.addClass("draw");

    card.ui.set_depth(-i - 6);
  }

  if (draw_animation_enabled) {
    deck.deck_space.classList.add("shuffle-animation");
    window.setTimeout(function () {
      deck.deck_space.classList.remove("shuffle-animation");
    }, SHUFFLE_ANIMATION_TIME);
  } else {
    deck.deck_space.classList.remove("shuffle-animation");
  }
}

function flip_up_top_card(deck) {
  var card;
  for (var i = 0; i < deck.discard.length; i++) {
    card = deck.discard[i];
    card.ui.removeClass("lift");
    card.ui.removeClass("pull");
    card.ui.push_down();
  }

  if (deck.discard.length > 0 && draw_animation_enabled) {
    deck.discard[0].ui.addClass("lift");
  }

  card = deck.draw_pile.shift();
  send_to_discard(card, true);
  deck.discard.unshift(card);
}

function send_to_discard(card, pull_animation) {
  card.ui.set_depth(-3);

  if (pull_animation && draw_animation_enabled) {
    card.ui.addClass("pull");
  } else {
    card.ui.removeClass("pull");
  }

  card.ui.flip_up(true);

  card.ui.removeClass("draw");
  card.ui.addClass("discard");
}

function draw_ability_card(deck) {
  if (deck.must_reshuffle()) {
    reshuffle(deck, true);
  } else {
    visible_ability_decks.forEach(function (visible_deck) {
      if (visible_deck.class == deck.class) {
        visible_deck.draw_top_card();
        flip_up_top_card(visible_deck);
      }
    });
  }
  write_to_storage(deck.name, JSON.stringify(deck));
}

function prevent_pull_animation(deck) {
  if (deck.discard.length) {
    if (deck.discard[1]) {
      deck.discard[1].ui.removeClass("lift");
      deck.discard[0].ui.addClass("lift");
    }

    deck.discard[0].ui.removeClass("pull");
  }
}

function reshuffle_modifier_deck(deck) {
  deck.clean_discard_pile();
  reshuffle(deck, true);
  document.body.dispatchEvent(
    new CustomEvent(EVENT_NAMES.MODIFIER_DECK_SHUFFLE_REQUIRED, {
      detail: { shuffle: false },
    })
  );
}

function draw_modifier_card(deck) {
  deck.clean_advantage_deck();

  if (deck.must_reshuffle()) {
    reshuffle_modifier_deck(deck);
  } else {
    flip_up_top_card(deck);

    document.body.dispatchEvent(
      new CustomEvent(EVENT_NAMES.MODIFIER_CARD_DRAWN, {
        detail: {
          card_type: deck.discard[0].card_type,
          count: deck.count(deck.discard[0].card_type),
        },
      })
    );

    if (deck.shuffle_end_of_round()) {
      document.body.dispatchEvent(
        new CustomEvent(EVENT_NAMES.MODIFIER_DECK_SHUFFLE_REQUIRED, {
          detail: { shuffle: true },
        })
      );
    }
  }
  write_to_storage("modifier_deck", JSON.stringify(deck));
}

function double_draw(deck) {
  var advantage_card;
  // Case there was 1 card in draw_pile when we clicked "draw 2".
  //    now we should draw, save that card, reshuffle, and
  //    draw the next
  if (deck.draw_pile.length == 1) {
    draw_modifier_card(deck);
    advantage_card = deck.discard[0];
    reshuffle_modifier_deck(deck);
    advantage_card = deck.draw_pile.shift();
    send_to_discard(advantage_card, false);
    deck.discard.unshift(advantage_card);
    draw_modifier_card(deck);
  }
  // Case there were 0 cards in draw_pile when we clicked "draw 2".
  //    we should reshuffle, draw 1 and send it to advantage_place,
  //    draw the next
  else if (deck.draw_pile.length == 0) {
    // This is in case the previous draw was double as well
    deck.clean_advantage_deck();
    reshuffle_modifier_deck(deck);
    draw_modifier_card(deck);
    advantage_card = deck.discard[0];
    draw_modifier_card(deck);
  }
  // Every other simple case
  else {
    draw_modifier_card(deck);
    advantage_card = deck.discard[0];
    draw_modifier_card(deck);
  }
  deck.discard[0].ui.addClass("right");
  advantage_card.ui.addClass("left");
  deck.advantage_to_clean = true;
}

function draw_next_ability_card(deck) {
  function do_draw() {
    visible_ability_decks.forEach(function (visible_deck) {
      if (visible_deck.class == deck.class) {
        visible_deck.draw_top_card();
        flip_up_top_card(visible_deck);
      }
    });

    write_to_storage(deck.name, JSON.stringify(deck));
  }

  if (deck.must_reshuffle()) {
    reshuffle(deck, true);
    if (draw_animation_enabled) {
      window.setTimeout(do_draw, SHUFFLE_ANIMATION_TIME);
    } else {
      do_draw();
    }
  } else {
    do_draw();
  }
}

function draw_all_monster_cards() {
  var processed = {};
  visible_ability_decks.forEach(function (deck) {
    if (!processed[deck.class]) {
      processed[deck.class] = true;
      draw_next_ability_card(deck);
    }
  });
}

function load_modifier_deck() {
  var deck = {
    name: "Monster modifier deck",
    type: DECK_TYPES.MODIFIER,
    draw_pile: [],
    discard: [],
    advantage_to_clean: false,
  };

  deck.draw_top_discard = function () {
    if (this.discard.length > 0) {
      var card = this.discard[this.discard.length - 1];
      card.ui.set_depth(-3);
      if (draw_animation_enabled) {
        card.ui.addClass("pull");
      } else {
        card.ui.removeClass("pull");
      }
      card.ui.flip_up(true);
      card.ui.removeClass("draw");
      card.ui.addClass("discard");
    }
    force_repaint_deck(this);
  };

  deck.count = function (card_type) {
    return this.draw_pile.filter(function (card) {
      return card.card_type === card_type;
    }).length;
  }.bind(deck);

  deck.remove_card = function (card_type) {
    for (var i = 0; i < deck.draw_pile.length; i++) {
      if (deck.draw_pile[i].card_type == card_type) {
        deck.draw_pile.splice(i, 1);
        reshuffle(deck, false);

        force_repaint_deck(deck);
        break;
      }
    }
    write_to_storage("modifier_deck", JSON.stringify(modifier_deck));

    return this.count(card_type);
  }.bind(deck);

  deck.add_card = function (card_type) {
    // Rulebook p. 23: "a maximum of only 10 curse [and 10 bless] cards can be placed into any one deck"
    if (this.count(card_type) < 10) {
      // TODO: Brittle
      deck.draw_pile.push(
        define_modifier_card(MODIFIER_CARDS[card_type.toUpperCase()])
      );

      force_repaint_deck(deck);
      reshuffle(deck, false);
    }
    write_to_storage("modifier_deck", JSON.stringify(modifier_deck));

    return this.count(card_type);
  }.bind(deck);

  deck.shuffle_end_of_round = function () {
    return (
      this.discard.filter(function (card) {
        return card.shuffle_next_round;
      }).length > 0
    );
  }.bind(deck);

  deck.must_reshuffle = function () {
    return !this.draw_pile.length;
  }.bind(deck);

  deck.clean_discard_pile = function () {
    for (var i = 0; i < deck.discard.length; i++) {
      if (
        this.discard[i].card_type == CARD_TYPES_MODIFIER.BLESS ||
        this.discard[i].card_type == CARD_TYPES_MODIFIER.CURSE
      ) {
        //Delete this curse/bless that has been used
        this.discard.splice(i, 1);
        i--;
      }
    }

    // This is needed every time we update
    force_repaint_deck(this);
  }.bind(deck);

  deck.clean_advantage_deck = function () {
    if (deck.advantage_to_clean && deck.discard[1]) {
      deck.advantage_to_clean = false;
      deck.discard[0].ui.removeClass("right");
      deck.discard[0].ui.removeClass("left");
      deck.discard[1].ui.removeClass("left");
      deck.discard[1].ui.removeClass("left");
    }
  }.bind(deck);
  var loaded_deck = JSON.parse(get_from_storage("modifier_deck"));

  MODIFIER_DECK.forEach(function (card_definition) {
    var card = define_modifier_card(card_definition);
    if (
      loaded_deck &&
      find_in_discard_and_remove(loaded_deck.discard, card.card_type)
    ) {
      deck.discard.push(card);
    } else {
      deck.draw_pile.push(card);
    }
  });

  return deck;
}

function find_in_discard_and_remove(discard, card_type) {
  for (var i = 0; i < discard.length; i++) {
    if (discard[i].card_type === card_type) {
      return discard.splice(i, 1);
    }
  }
  return null;
}

function create_modifier_card_back() {
  var card = document.createElement("div");
  card.className = "card modifier back";

  return card;
}

function create_modifier_card_front(card_url) {
  var img = document.createElement("img");
  img.className = "cover";
  img.src = card_url;

  var card = document.createElement("div");
  card.className = "card modifier front";
  card.appendChild(img);

  return card;
}

function define_modifier_card(card_definition) {
  var card_front = create_modifier_card_front(card_definition.image);
  var card_back = create_modifier_card_back();

  var card = {
    ui: new UICard(card_front, card_back),
    card_type: card_definition.type,
    shuffle_next_round: card_definition.shuffle,
  };

  return card;
}

function end_round() {
  if (modifier_deck.shuffle_end_of_round()) {
    modifier_deck.clean_advantage_deck();
    reshuffle_modifier_deck(modifier_deck);
  }
  write_to_storage("modifier_deck", JSON.stringify(modifier_deck));
}

function load_definition(card_database) {
  var decks = {};
  for (var i = 0; i < card_database.length; i++) {
    var definition = card_database[i];
    decks[definition.class] = definition;
  }

  return decks;
}

function get_monster_stats(name, level) {
  var attack = [
    MONSTER_STATS["monsters"][name]["level"][level]["normal"]["attack"],
    MONSTER_STATS["monsters"][name]["level"][level]["elite"]["attack"],
  ];
  var move = [
    MONSTER_STATS["monsters"][name]["level"][level]["normal"]["move"],
    MONSTER_STATS["monsters"][name]["level"][level]["elite"]["move"],
  ];
  var range = [
    MONSTER_STATS["monsters"][name]["level"][level]["normal"]["range"],
    MONSTER_STATS["monsters"][name]["level"][level]["elite"]["range"],
  ];
  var attributes = [
    MONSTER_STATS["monsters"][name]["level"][level]["normal"]["attributes"],
    MONSTER_STATS["monsters"][name]["level"][level]["elite"]["attributes"],
  ];

  var health = [
    MONSTER_STATS["monsters"][name]["level"][level]["normal"]["health"],
    MONSTER_STATS["monsters"][name]["level"][level]["elite"]["health"],
  ];

  return {
    attack: attack,
    move: move,
    range: range,
    attributes: attributes,
    health: health,
  };
}

function get_boss_stats(name, level) {
  name = name.replace("Boss: ", "");
  var attack = [MONSTER_STATS["bosses"][name]["level"][level]["attack"]];
  var move = [MONSTER_STATS["bosses"][name]["level"][level]["move"]];
  var range = [MONSTER_STATS["bosses"][name]["level"][level]["range"]];
  var special1 = MONSTER_STATS["bosses"][name]["level"][level]["special1"];
  var special2 = MONSTER_STATS["bosses"][name]["level"][level]["special2"];
  var immunities = MONSTER_STATS["bosses"][name]["level"][level]["immunities"];
  var notes = MONSTER_STATS["bosses"][name]["level"][level]["notes"];
  var health = [MONSTER_STATS["bosses"][name]["level"][level]["health"]];

  return {
    attack: attack,
    move: move,
    range: range,
    special1: special1,
    special2: special2,
    immunities: immunities,
    notes: notes,
    health: health,
  };
}

function apply_deck_selection(decks, preserve_existing_deck_state) {
  var container = document.getElementById("tableau");
  document.getElementById("currentdeckslist").innerHTML = "";
  var decks_to_remove = visible_ability_decks.filter(function (visible_deck) {
    return (
      !preserve_existing_deck_state ||
      decks.filter(function (deck) {
        return (
          deck.name == visible_deck.name && deck.level == visible_deck.level
        );
      }).length == 0
    );
  });

  var decks_to_add = decks.filter(function (deck) {
    return (
      !preserve_existing_deck_state ||
      visible_ability_decks.filter(function (visible_deck) {
        return (
          deck.name == visible_deck.name && deck.level == visible_deck.level
        );
      }).length == 0
    );
  });

  if (!modifier_deck) {
    init_modifier_deck();
    add_modifier_deck(container, modifier_deck, preserve_existing_deck_state);
    if (preserve_existing_deck_state) {
      var loaded_modifier_deck = JSON.parse(get_from_storage("modifier_deck"));
      var curses = count_type("curse", loaded_modifier_deck);
      var blessings = count_type("bless", loaded_modifier_deck);
      for (var i = 0; i < blessings; i++) {
        modifier_deck.add_card("bless");
      }
      for (var i = 0; i < curses; i++) {
        modifier_deck.add_card("curse");
      }
      modifier_deck.draw_top_discard();

      document.body.dispatchEvent(
        new CustomEvent(EVENT_NAMES.MODIFIER_DECK_SHUFFLE_REQUIRED, {
          detail: { shuffle: modifier_deck.shuffle_end_of_round() },
        })
      );
    }
  } else if (!preserve_existing_deck_state) {
    init_modifier_deck();
    add_modifier_deck(container, modifier_deck, preserve_existing_deck_state);
  }
  write_to_storage("modifier_deck", JSON.stringify(modifier_deck));

  var old_stats = document.getElementById("monster-stats-container");
  if (old_stats) {
    container.removeChild(old_stats);
  }
  var stats_container = document.createElement("div");
  stats_container.id = "monster-stats-container";
  stats_container.className = "monster-stats-container";

  var collapse_placeholder = document.createElement("div");
  collapse_placeholder.className = "monster-stats-placeholder";
  collapse_placeholder.textContent = "Monster Stats";
  stats_container.appendChild(collapse_placeholder);

  stats_container.addEventListener("click", function () {
    this.classList.toggle("collapsed");
  });

  container.appendChild(stats_container);

  decks_to_remove.forEach(function (deck) {
    deck.discard_deck();

  });
  visible_ability_decks.forEach(function (deck) {
    var deckid = deck.get_real_name().replace(/\s+/g, "");
    var stat_block = create_stat_block(deck);
    stat_block.id = deckid + "-stats";
    deck.stat_block = stat_block;
    if (!deck.deck_space || deck.deck_space.className != "hiddendeck") {
      stats_container.appendChild(stat_block);
    }
  });


  decks_to_add.forEach(function (deck) {
    var deckid = deck.get_real_name().replace(/\s+/g, "");
    var deck_space = document.createElement("div");
    deck_space.id = deckid;
    deck_space.addEventListener(
      "contextmenu",
      function (e) {
        this.className = "hiddendeck";
        var sb = document.getElementById(deckid + "-stats");
        if (sb) sb.style.display = "none";
        e.preventDefault();
      },
      false
    );
    deck_space.className = "card-container";
    deck_space.title = "Click to draw enemy ability";

    container.appendChild(deck_space);

    place_deck(deck, deck_space);
    reshuffle(deck, !preserve_existing_deck_state);
    if (preserve_existing_deck_state) {
    }
    deck_space.onclick = draw_ability_card.bind(null, deck);

    deck.discard_deck = function () {
      var index = visible_ability_decks.indexOf(this);

      if (index > -1) {
        visible_ability_decks.splice(index, 1);
      }

      container.removeChild(deck_space);
      if (this.stat_block && this.stat_block.parentNode) {
        this.stat_block.parentNode.removeChild(this.stat_block);
      }
    };

    if (deck.is_boss()) {
      // We don't want stats if someone selects Boss on the deck tab
      if (deck.get_real_name() != "Boss") {
        deck.set_stats_boss(get_boss_stats(deck.get_real_name(), deck.level));
      }
    } else {
      deck.set_stats_monster(
        get_monster_stats(deck.get_real_name(), deck.level)
      );
    }
    var stat_block = create_stat_block(deck);
    stat_block.id = deckid + "-stats";
    deck.stat_block = stat_block;
    stats_container.appendChild(stat_block);

    reshuffle(deck);
    if (preserve_existing_deck_state) {
      deck.draw_top_discard();
    } else {
      force_repaint_deck(deck);
    }
    visible_ability_decks.push(deck);

    var currentdeckslist = document.getElementById("currentdeckslist");
    var list_item = document.createElement("li");
    list_item.className = "currentdeck";
    currentdeckslist.appendChild(list_item);
    var label = document.createElement("a");
    label.id = "switch-" + deckid;
    label.href = "#switch-" + deckid;
    label.innerText = deck.get_real_name();
    label.title = "Click to show/hide deck";
    label.addEventListener(
      "click",
      function (e) {
        var deckId = this.id.replace("switch-", "");
        var d = document.getElementById(deckId);
        var wasHidden = d.className == "hiddendeck";
        d.className = wasHidden ? "card-container" : "hiddendeck";
        var sb = document.getElementById(deckId + "-stats");
        if (sb) sb.style.display = wasHidden ? "" : "none";
      },
      false
    );
    list_item.appendChild(label);
  });

  // Apply user preferred card size and rescale text if necessary
  update_card_size();
}

function init_modifier_deck() {
  modifier_deck = load_modifier_deck();
}

function count_type(type, deck) {
  var count = 0;
  if (deck) {
    for (var i = 0; i < deck.draw_pile.length; i++) {
      if (deck.draw_pile[i].card_type === type) {
        count++;
      }
    }
  }
  return count;
}

function add_modifier_deck(container, deck, preserve_discards) {
  function init_counter(element, card_type, increment_func, decrement_func) {
    var text_element = element.querySelector(".icon-text");
    var inc_btn = element.querySelector(".increment.button");
    var dec_btn = element.querySelector(".decrement.button");

    if (inc_btn) {
      inc_btn.onclick = function () {
        text_element.innerText = increment_func(card_type);
      };
    }
    if (dec_btn) {
      dec_btn.onclick = function () {
        text_element.innerText = decrement_func(card_type);
      };
    }

    document.body.addEventListener(
      EVENT_NAMES.MODIFIER_CARD_DRAWN,
      function (e) {
        if (e.detail.card_type === card_type) {
          text_element.innerText = e.detail.count;
        }
      }
    );
  }

  function indicate_shuffle_required(e) {
    if (e.detail.shuffle) {
      window.setTimeout(function () {
        end_round_div.className = "counter-icon shuffle";
      }, 400);
    } else {
      end_round_div.className = "counter-icon shuffle not-required";
    }
  }

  var modifier_container = document.getElementById("modifier-container");
  var deck_column = modifier_container.querySelector(".modifier-deck-column-2");
  var button_div = modifier_container.querySelector(".modifier-deck-column-1");

  var deck_space = document.getElementById("modifier-deck-space");
  var draw_two_button = modifier_container.querySelector(".button.draw-two");
  var draw_all_button = modifier_container.querySelector(".button.draw-all");
  var end_round_div = document.getElementById("end-round");

  init_counter(
    document.getElementById("bless-counter"),
    "bless",
    deck.add_card,
    deck.remove_card
  );
  init_counter(
    document.getElementById("curse-counter"),
    "curse",
    deck.add_card,
    deck.remove_card
  );

  end_round_div.onclick = end_round;
  draw_two_button.onclick = double_draw.bind(null, modifier_deck);
  draw_all_button.onclick = draw_all_monster_cards;

  document.body.addEventListener(
    EVENT_NAMES.MODIFIER_DECK_SHUFFLE_REQUIRED,
    indicate_shuffle_required
  );

  container.appendChild(modifier_container);

  place_deck(deck, deck_space);
  reshuffle(deck, !preserve_discards);
  deck_space.onclick = draw_modifier_card.bind(null, deck);
}


function create_stat_block(deck) {
  function stat_line(macro, values) {
    if (macro === "%range%" && values[0] === 0) {
      return null;
    }
    var div = document.createElement("div");
    var html = expand_macro(macro) + " " + values[0];
    if (values.length > 1 && values[1] > 0) {
      html += " / <span class='elite-color'>" + values[1] + "</span>";
    }
    div.innerHTML = html;
    return div;
  }

  function icon_stat(icon, values, skip_zero) {
    if (skip_zero && values[0] === 0) {
      return null;
    }
    var div = document.createElement("div");
    var img = document.createElement("img");
    img.className = "icon";
    img.src = "images/" + icon + ".svg";
    div.appendChild(img);
    div.appendChild(document.createTextNode(" " + values[0]));
    if (values.length > 1 && values[1] > 0) {
      div.appendChild(document.createTextNode(" / "));
      var span = document.createElement("span");
      span.className = "elite-color";
      span.textContent = values[1];
      div.appendChild(span);
    }
    return div;
  }

  function macro_to_icon(macro) {
    var html = expand_macro(macro);
    var m = /src='images\/(.*?)\.svg'/.exec(html);
    return m ? m[1] : null;
  }

  function icon_attr(icon, normal_val, elite_val) {
    var has_normal = normal_val !== undefined;
    var has_elite = elite_val !== undefined;
    if (!has_normal && !has_elite) {
      return null;
    }
    var div = document.createElement("div");
    function add_img(container) {
      var img = document.createElement("img");
      img.className = "icon";
      img.src = "images/" + icon + ".svg";
      container.appendChild(img);
    }
    if (has_normal) {
      add_img(div);
      if (normal_val !== null && normal_val !== true) {
        div.appendChild(document.createTextNode(" " + normal_val));
      }
      if (has_elite) {
        if (elite_val !== null && elite_val !== true) {
          div.appendChild(document.createTextNode(" / "));
          var span = document.createElement("span");
          span.className = "elite-color";
          span.textContent = elite_val;
          div.appendChild(span);
        }
      }
    } else if (has_elite) {
      var span = document.createElement("span");
      span.className = "elite-color";
      add_img(span);
      if (elite_val !== null && elite_val !== true) {
        span.appendChild(document.createTextNode(" " + elite_val));
      }
      div.appendChild(span);
    }
    return div;
  }

  var block = document.createElement("div");
  block.className = "monster-stat-block";

  var name = document.createElement("div");
  name.textContent = deck.get_real_name();
  block.appendChild(name);

  var grid = document.createElement("div");
  grid.className = "stats-grid";

  var hp = document.createElement("div");
  hp.innerHTML = "HP " + deck.health[0];
  if (deck.health.length > 1 && deck.health[1] > 0) {
    hp.innerHTML += " / <span class='elite-color'>" + deck.health[1] + "</span>";
  }
  grid.appendChild(hp);

  var move = icon_stat("move", deck.move);
  if (move) grid.appendChild(move);
  var attack = icon_stat("attack", deck.attack);
  if (attack) grid.appendChild(attack);
  var range = icon_stat("range", deck.range, true);
  if (range) grid.appendChild(range);

  if (deck.attributes && (deck.attributes[0].length || deck.attributes[1].length)) {
    var map = {};
    [0, 1].forEach(function(idx) {
      deck.attributes[idx].forEach(function(a) {
        a.split(":").forEach(function(part) {
          part = part.trim();
          if (!part) return;
          var m = part.match(/(%[^%]+%)(?:\s*(-?\d+))?/);
          if (!m) return;
          var icon = macro_to_icon(m[1]);
          if (!icon) return;
          if (!map[icon]) map[icon] = [undefined, undefined];
          map[icon][idx] = m[2] ? parseInt(m[2]) : true;
        });
      });
    });
    Object.keys(map).forEach(function(icon) {
      var div = icon_attr(icon, map[icon][0], map[icon][1]);
      if (div) grid.appendChild(div);
    });
  }

  if (grid.childElementCount > 4) {
    grid.classList.add("three-cols");
  }

  block.appendChild(grid);

  if (deck.immunities && deck.immunities.length) {
    var imm = document.createElement("div");
    imm.className = "small";
    imm.innerHTML =
      "Immunities: " + deck.immunities.map(expand_macro).join(", ");
    block.appendChild(imm);
  }

  if (deck.notes && deck.notes.trim() !== "") {
    var note = document.createElement("div");
    note.className = "small";
    note.innerHTML = "Notes: " + deck.notes;
    block.appendChild(note);
  }

  return block;
}
function LevelSelector(text, inline) {
  var max_level = 7;
  var level = {};
  level.html = inline
    ? document.createElement("span")
    : document.createElement("ul");
  level.html.className = "selectionlist";

  var listitem = inline
    ? document.createElement("label")
    : document.createElement("li");
  listitem.innerText = text;
  level.html.appendChild(listitem);

  var level_spinner = create_input("number", "scenario_number", "1", "");
  level_spinner.input.min = 0;
  level_spinner.input.max = max_level;
  level.html.appendChild(level_spinner.input);
  level.spinner = level_spinner.input;

  level.get_selection = function () {
    return this.spinner.value > max_level ? max_level : this.spinner.value;
  };

  level.set_value = function (value) {
    this.spinner.value = value > max_level ? max_level : value;
  };

  return level;
}

function DeckList() {
  var decklist = {};
  decklist.ul = document.createElement("ul");
  decklist.ul.className = "selectionlist";
  decklist.checkboxes = {};
  decklist.level_selectors = {};
  decklist.global_level_selector = null;

  var listitem = document.createElement("li");
  var global_level_selector = new LevelSelector("Select global level ", true);
  listitem.appendChild(global_level_selector.html);
  decklist.global_level_selector = global_level_selector;

  var dom_dict = create_input("button", "applylevel", "Apply All", "");
  dom_dict.input.onclick = function () {
    var key;
    for (key in decklist.level_selectors) {
      decklist.level_selectors[key].set_value(
        decklist.global_level_selector.get_selection()
      );
    }
  };
  listitem.appendChild(dom_dict.root);

  decklist.ul.appendChild(listitem);

  var key;
  for (key in DECKS) {
    var real_name = DECKS[key].name;
    var listitem = document.createElement("li");
    var dom_dict = create_input("checkbox", "deck", real_name, real_name);
    listitem.appendChild(dom_dict.root);

    var level_selector = new LevelSelector(" with level ", true);
    listitem.appendChild(level_selector.html);

    decklist.ul.appendChild(listitem);
    decklist.checkboxes[real_name] = dom_dict.input;
    decklist.level_selectors[real_name] = level_selector;
  }

  decklist.get_selection = function () {
    return dict_values(this.checkboxes).filter(is_checked).map(input_value);
  };

  decklist.get_selected_decks = function () {
    var selected_checkbox = this.get_selection();
    var selected_decks = concat_arrays(
      selected_checkbox.map(
        function (name) {
          var deck = name in DECKS ? DECKS[name] : [];
          deck.level = decklist.level_selectors[name].get_selection();
          return deck;
        }.bind(this)
      )
    );
    return selected_decks;
  };

  decklist.set_selection = function (selected_deck_names) {
    dict_values(this.checkboxes).forEach(function (checkbox) {
      checkbox.checked = false;
    });

    selected_deck_names.forEach(
      function (deck_names) {
        var checkbox = this.checkboxes[deck_names.name];
        if (checkbox) {
          checkbox.checked = true;
          decklist.level_selectors[deck_names.name].set_value(deck_names.level);
        }
      }.bind(this)
    );
  };

  return decklist;
}

function ScenarioList(scenarios) {
  var scenariolist = {};
  scenariolist.ul = document.createElement("ul");
  scenariolist.ul.className = "selectionlist";
  scenariolist.spinner = null;
  scenariolist.decks = {};
  scenariolist.special_rules = {};
  scenariolist.level_selector = null;

  scenariolist.level_selector = new LevelSelector("Select level", false);

  scenariolist.ul.appendChild(scenariolist.level_selector.html);

  for (var i = 0; i < scenarios.length; i++) {
    var scenario = scenarios[i];
    scenariolist.decks[i] = scenario.decks;
    scenariolist.special_rules[i] = scenario.special_rules
      ? scenario.special_rules
      : "";
  }

  var listitem = document.createElement("li");
  listitem.innerText = "Select scenario number";
  scenariolist.ul.appendChild(listitem);

  var scenario_spinner = create_input("number", "scenario_number", "1", "");
  scenario_spinner.input.min = 1;
  scenario_spinner.input.max = scenarios.length;
  scenariolist.ul.appendChild(scenario_spinner.input);
  scenariolist.spinner = scenario_spinner.input;

  scenariolist.get_selection = function () {
    // We're using the scenario index that is zero-based, but the scenario list is 1-based
    var current_value = scenariolist.spinner.value - 1;
    return Math.min(current_value, scenarios.length + 1);
  };

  scenariolist.get_level = function (deck_name, special_rules) {
    var base_level = scenariolist.level_selector.get_selection();

    if (
      special_rules.indexOf(SPECIAL_RULES.living_corpse_two_levels_extra) >=
        0 &&
      deck_name == SPECIAL_RULES.living_corpse_two_levels_extra.affected_deck
    ) {
      return Math.min(
        7,
        parseInt(base_level) +
          parseInt(SPECIAL_RULES.living_corpse_two_levels_extra.extra_levels)
      );
    } else {
      return base_level;
    }
  };

  scenariolist.get_scenario_decks = function () {
    return this.decks[this.get_selection()].map(function (deck) {
      if (DECKS[deck.name]) {
        deck.class = DECKS[deck.name].class;
      } else if (deck.name.indexOf("Boss") != -1) {
        deck.class = DECKS["Boss"].class;
      }
      deck.level = scenariolist.get_level(
        deck.name,
        scenariolist.get_special_rules()
      );
      return deck;
    });
  };

  scenariolist.get_special_rules = function () {
    return this.special_rules[this.get_selection()];
  };

  return scenariolist;
}

function load_saved_state(decklist, scenariolist) {
  var selected_deck_names = JSON.parse(get_from_storage("selected_deck_names"));
  if (selected_deck_names && selected_deck_names.length) {
    decklist.set_selection(selected_deck_names);
    var selected_decks = selected_deck_names.map(function (deck_names) {
      return load_ability_deck(
        deck_names.class,
        deck_names.name,
        deck_names.level
      );
    });
    apply_deck_selection(selected_decks, true);

    var scenario_number = parseInt(get_from_storage("scenario_number"));
    if (!isNaN(scenario_number)) {
      scenariolist.spinner.value = scenario_number;
    }
    var scenario_level = parseInt(get_from_storage("scenario_level"));
    if (!isNaN(scenario_level)) {
      scenariolist.level_selector.set_value(scenario_level);
    }

    var modifier_deck_section = document.getElementById("modifier-container");
    var showmodifierdeck = document.getElementById("showmodifierdeck");
    if (!showmodifierdeck.checked && modifier_deck_section) {
      modifier_deck_section.style.display = "none";
    }
  }
}

function init() {
  var deckspage = document.getElementById("deckspage");
  var scenariospage = document.getElementById("scenariospage");
  var applydeckbtn = document.getElementById("applydecks");
  var applyscenariobtn = document.getElementById("applyscenario");
  var applyloadbtn = document.getElementById("applyload");
  var cardsizeplus = document.getElementById("cardsizeplus");
  var cardsizeminus = document.getElementById("cardsizeminus");
  var cardsizereset = document.getElementById("cardsizereset");
  var cardsizevalue = document.getElementById("cardsizevalue");
  var showmodifierdeck = document.getElementById("showmodifierdeck");
  var enableanimations = document.getElementById("enableanimations");

  enableanimations.checked = draw_animation_enabled;
  if (!draw_animation_enabled) {
    document.body.classList.add("no-animation");
  }
  enableanimations.onchange = function () {
    draw_animation_enabled = this.checked;
    if (draw_animation_enabled) {
      document.body.classList.remove("no-animation");
    } else {
      document.body.classList.add("no-animation");
    }
    localStorage.setItem("draw_animation_enabled", draw_animation_enabled);
  };

  if (cardsizevalue) {
    cardsizevalue.textContent = Math.round(card_size_factor * 100) + "%";
  }

  var decklist = new DeckList();
  var scenariolist = new ScenarioList(SCENARIO_DEFINITIONS);

  deckspage.insertAdjacentElement("afterbegin", decklist.ul);
  scenariospage.insertAdjacentElement("afterbegin", scenariolist.ul);

  load_saved_state(decklist, scenariolist);

  applydeckbtn.onclick = function () {
    localStorage.clear();
    var selected_deck_names = decklist.get_selected_decks();
    write_to_storage(
      "selected_deck_names",
      JSON.stringify(selected_deck_names)
    );
    var selected_decks = selected_deck_names.map(function (deck_names) {
      return load_ability_deck(
        deck_names.class,
        deck_names.name,
        deck_names.level
      );
    });
    apply_deck_selection(selected_decks, true);
    var showmodifierdeck_deckspage = document.getElementById(
      "showmodifierdeck-deckspage"
    );
    var modifier_deck_section = document.getElementById("modifier-container");
    if (!showmodifierdeck_deckspage.checked) {
      modifier_deck_section.style.display = "none";
    } else {
      modifier_deck_section.style.display = "block";
    }
  };

  applyscenariobtn.onclick = function () {
    try {
      localStorage.clear();
    } catch (e) {
      console.error("Local storage is required");
      return;
    }
    var selected_deck_names = scenariolist.get_scenario_decks();
    write_to_storage("scenario_number", scenariolist.spinner.value);
    write_to_storage(
      "scenario_level",
      scenariolist.level_selector.get_selection()
    );
    write_to_storage(
      "selected_deck_names",
      JSON.stringify(selected_deck_names)
    );
    decklist.set_selection(selected_deck_names);
    var selected_decks = selected_deck_names.map(function (deck_names) {
      return load_ability_deck(
        deck_names.class,
        deck_names.name,
        deck_names.level
      );
    });
    apply_deck_selection(selected_decks, false);
    var modifier_deck_section = document.getElementById("modifier-container");
    if (!showmodifierdeck.checked) {
      modifier_deck_section.style.display = "none";
    } else {
      modifier_deck_section.style.display = "block";
    }

    // assume user is ready to go, so hide the Settings menu
    show_settingspane(settingspane, cancelarea, false);
  };

  applyloadbtn.onclick = function () {
    var selected_deck_names = JSON.parse(
      get_from_storage("selected_deck_names")
    );
    var scenario_number = parseInt(get_from_storage("scenario_number"));
    if (!isNaN(scenario_number)) {
      scenariolist.spinner.value = scenario_number;
    }
    var scenario_level = parseInt(get_from_storage("scenario_level"));
    if (!isNaN(scenario_level)) {
      scenariolist.level_selector.set_value(scenario_level);
    }
    decklist.set_selection(selected_deck_names);
    var selected_decks = selected_deck_names.map(function (deck_names) {
      return load_ability_deck(
        deck_names.class,
        deck_names.name,
        deck_names.level
      );
    });
    apply_deck_selection(selected_decks, true);
    var modifier_deck_section = document.getElementById("modifier-container");
    if (!showmodifierdeck.checked) {
      modifier_deck_section.style.display = "none";
    } else {
      modifier_deck_section.style.display = "block";
    }
  };

  cardsizeplus.onclick = function () {
    card_size_factor += 0.1;
    update_card_size();
  };

  cardsizeminus.onclick = function () {
    card_size_factor = Math.max(0.1, card_size_factor - 0.1);
    update_card_size();
  };

  cardsizereset.onclick = function () {
    card_size_factor = DEFAULT_CARD_SIZE_FACTOR;
    update_card_size();
  };

  window.onresize = refresh_ui.bind(null, visible_ability_decks);
}

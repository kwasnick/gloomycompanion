var visible_ability_decks = [];
var modifier_deck = null;
var active_game = null;
var settings_controls;
var restore_failed = false;
var deck_definitions = load_definition(DECK_DEFINITONS);

// scaling factor for card container width
var DEFAULT_CARD_SIZE_FACTOR = 1;
var card_size_factor = DEFAULT_CARD_SIZE_FACTOR;
var draw_animation_enabled = true;

var SHUFFLE_ANIMATION_TIME = 600; // ms, keep in sync with CSS

var DECK_TYPES = {
  MODIFIER: "modifier",
  ABILITY: "ability",
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

function create_ability_deck(deck_class, deck_name, level) {
  var deck_definition = deck_definitions[deck_class];
  var deck = {
    class: deck_definition.class,
    name: deck_name,
    type: DECK_TYPES.ABILITY,
    draw_pile: [],
    discard: [],
    move: [0, 0],
    attack: [0, 0],
    range: [0, 0],
    level: level,
    health: [0, 0],
    hidden: false,
  };

  deck.is_boss = function () {
    return this.class === DECKS["Boss"].class;
  };

  if (deck.is_boss()) {
    if (deck.name !== "Boss") {
      Object.assign(deck, get_boss_stats(deck.name, deck.level));
    }
  } else {
    Object.assign(deck, get_monster_stats(deck.name, deck.level));
  }

  deck_definition.cards.forEach(function (definition, index) {
    var front = document.createElement("div");
    front.className = "card ability front down";
    deck.draw_pile.push({
      id: index,
      ui: new UICard(front, create_ability_card_back(deck.name, deck.level)),
      shuffle_next: definition[0],
      initiative: definition[1],
      starting_lines: definition.slice(2),
    });
  });
  return deck;
}

function paint_ability_card(deck, card) {
  var lines = card.starting_lines;
  var extra_lines = [];
  if (deck.is_boss()) {
    lines = [];
    card.starting_lines.forEach(function (line) {
      lines = lines.concat(special_to_lines(line, deck.special1, deck.special2));
    });
    if (deck.immunities) {
      extra_lines = extra_lines.concat(immunities_to_lines(deck.immunities));
    }
    if (deck.notes) {
      extra_lines = extra_lines.concat(notes_to_lines(deck.notes));
    }
  } else if (deck.attributes) {
    extra_lines = attributes_to_lines(deck.attributes);
  }

  card.ui.front = create_ability_card_front(
    card.initiative,
    deck.name,
    card.shuffle_next,
    lines.concat(extra_lines),
    deck.attack,
    deck.move,
    deck.range,
    deck.level,
    deck.health
  );
}

function ability_deck_must_reshuffle(deck) {
  return deck.draw_pile.length === 0 ||
    (deck.discard.length > 0 && deck.discard[0].shuffle_next);
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
    if (c.classList.contains("modifier")) {
      continue;
    }
    c.style.width = base_width * card_size_factor + "px";
  }
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
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].classList.contains("ability")) {
      var height = cards[i].getBoundingClientRect().height;
      if (height === 0) {
        continue;
      }
      var scale = height / actual_card_height;
      var scaled_font_size = base_font_size * scale;
      tableau.style.fontSize = scaled_font_size + "px";
      break;
    }
  }
}

function show_draw_pile(deck) {
  deck.draw_pile.forEach(function (card, index) {
    card.ui.removeClass("lift");
    card.ui.removeClass("pull");
    card.ui.removeClass("after-shuffle");
    card.ui.flip_up(false);
    card.ui.removeClass("discard");
    card.ui.addClass("draw");
    card.ui.set_depth(-index - 6);
  });
}

function render_deck_piles(deck) {
  show_draw_pile(deck);
  deck.discard.forEach(function (card, index) {
    if (deck.type === DECK_TYPES.ABILITY) {
      paint_ability_card(deck, card);
    }
    card.ui.removeClass("lift");
    send_to_discard(card, false, false);
    card.ui.set_depth(-index - 3);
  });
  if (deck.split_draw) {
    show_split_draw(deck, true);
  }
}

function play_shuffle_animation(deck) {
  if (draw_animation_enabled) {
    var space = deck.deck_space;
    window.clearTimeout(deck.shuffle_timer);
    space.classList.add("shuffle-animation");
    deck.shuffle_timer = window.setTimeout(function () {
      space.classList.remove("shuffle-animation");
    }, SHUFFLE_ANIMATION_TIME);
  }
}

function flip_up_top_card(deck, animate, after_shuffle) {
  deck.discard.forEach(function (card) {
    card.ui.removeClass("lift");
    card.ui.removeClass("pull");
    card.ui.removeClass("after-shuffle");
    card.ui.push_down();
  });

  if (deck.discard.length > 0 && animate && draw_animation_enabled) {
    deck.discard[0].ui.addClass("lift");
  }

  var card = deck.draw_pile.shift();
  send_to_discard(card, animate, after_shuffle);
  deck.discard.unshift(card);
  deck.draw_pile.forEach(function (remaining_card, index) {
    remaining_card.ui.set_depth(-index - 6);
  });
}

function send_to_discard(card, animate, after_shuffle) {
  card.ui.set_depth(-3);
  card.ui.removeClass("pull");
  card.ui.removeClass("after-shuffle");
  if (animate && draw_animation_enabled) {
    card.ui.addClass("pull");
    if (after_shuffle) {
      card.ui.addClass("after-shuffle");
    }
  }
  card.ui.flip_up(true);
  card.ui.removeClass("draw");
  card.ui.addClass("discard");
}

function decks_of_class(deck_class) {
  return visible_ability_decks.filter(function (deck) {
    return deck.class === deck_class;
  });
}

function reshuffle_ability_decks(decks) {
  var first = decks[0];
  first.draw_pile = first.draw_pile.concat(first.discard);
  first.discard = [];
  shuffle_list(first.draw_pile);
  var piles = encode_piles(first, "id");

  decks.forEach(function (deck) {
    if (deck !== first) {
      set_ability_piles(deck, piles);
    }
    show_draw_pile(deck);
    play_shuffle_animation(deck);
  });
}

function draw_ability_cards(decks, draw_after_shuffle) {
  var shuffled = ability_deck_must_reshuffle(decks[0]);
  if (shuffled) {
    reshuffle_ability_decks(decks);
    if (!draw_after_shuffle) {
      return;
    }
  }

  decks.forEach(function (deck) {
    paint_ability_card(deck, deck.draw_pile[0]);
    force_repaint_deck(deck);
    flip_up_top_card(deck, true, shuffled);
  });
}

function draw_ability_card(deck) {
  draw_ability_cards(decks_of_class(deck.class), false);
  save_app_state();
}

function draw_all_monster_cards() {
  var classes = new Set(visible_ability_decks.map(function (deck) {
    return deck.class;
  }));
  classes.forEach(function (deck_class) {
    draw_ability_cards(decks_of_class(deck_class), true);
  });
  save_app_state();
}

function prevent_pull_animation(deck) {
  if (deck.discard.length) {
    if (deck.discard[1]) {
      deck.discard[1].ui.removeClass("lift");
      deck.discard[0].ui.addClass("lift");
    }
    deck.discard[0].ui.removeClass("pull");
    deck.discard[0].ui.removeClass("after-shuffle");
  }
}

function change_modifier_card(deck, card_type, delta) {
  var index = deck.draw_pile.findIndex(function (card) {
    return card.card_type === card_type;
  });
  if (delta > 0 && count_modifier_cards(deck, card_type) < 10) {
    deck.draw_pile.push(define_modifier_card(MODIFIER_CARDS[card_type.toUpperCase()]));
  } else if (delta < 0 && index !== -1) {
    deck.draw_pile.splice(index, 1);
  } else {
    return;
  }

  shuffle_list(deck.draw_pile);
  show_draw_pile(deck);
  force_repaint_deck(deck);
  play_shuffle_animation(deck);
  commit_modifier_action(deck);
}

function count_modifier_cards(deck, card_type) {
  return deck.draw_pile.filter(function (card) {
    return card.card_type === card_type;
  }).length;
}

function modifier_shuffle_required(deck) {
  return deck.discard.some(function (card) {
    return card.shuffle_next_round;
  });
}

function show_split_draw(deck, split) {
  deck.split_draw = split;
  if (split) {
    deck.discard[0].ui.addClass("right");
    deck.discard[1].ui.addClass("left");
  } else {
    deck.discard[0].ui.removeClass("right");
    deck.discard[1].ui.removeClass("left");
  }
}

function reshuffle_modifier_deck(deck) {
  if (deck.split_draw) {
    show_split_draw(deck, false);
  }
  var reusable_cards = deck.discard.filter(function (card) {
    return card.card_type !== CARD_TYPES_MODIFIER.BLESS &&
      card.card_type !== CARD_TYPES_MODIFIER.CURSE;
  });
  deck.draw_pile = deck.draw_pile.concat(reusable_cards);
  deck.discard = [];
  shuffle_list(deck.draw_pile);
  show_draw_pile(deck);
  force_repaint_deck(deck);
  play_shuffle_animation(deck);
}

function draw_modifier_card(deck) {
  if (deck.split_draw) {
    show_split_draw(deck, false);
  }
  if (deck.draw_pile.length === 0) {
    reshuffle_modifier_deck(deck);
  } else {
    flip_up_top_card(deck, true, false);
  }
  commit_modifier_action(deck);
}

function double_draw(deck) {
  if (deck.split_draw) {
    show_split_draw(deck, false);
  }
  if (deck.draw_pile.length === 0) {
    reshuffle_modifier_deck(deck);
  } else if (deck.draw_pile.length === 1) {
    // Keep the last draw out of the reshuffle so it remains part of the pair.
    var first_card = deck.draw_pile.shift();
    reshuffle_modifier_deck(deck);
    deck.draw_pile.unshift(first_card);
    first_card.ui.attach(deck.deck_space);
  }

  flip_up_top_card(deck, false, false);
  flip_up_top_card(deck, true, false);
  show_split_draw(deck, true);
  commit_modifier_action(deck);
}

function create_modifier_deck(saved) {
  var deck = {
    type: DECK_TYPES.MODIFIER,
    draw_pile: [],
    discard: [],
    split_draw: false,
  };

  if (saved === null) {
    deck.draw_pile = MODIFIER_DECK.map(define_modifier_card);
    shuffle_list(deck.draw_pile);
  } else {
    var piles = saved.piles;
    require_saved_state(piles && Array.isArray(piles.draw_pile) && Array.isArray(piles.discard));
    require_saved_state(typeof saved.split_draw === "boolean" &&
      (!saved.split_draw || piles.discard.length >= 2));
    var remaining = new Map();
    MODIFIER_DECK.forEach(function (definition) {
      remaining.set(definition.type, (remaining.get(definition.type) || 0) + 1);
    });
    function restore_card(type) {
      require_saved_state(typeof type === "string" && Object.hasOwn(MODIFIER_CARDS, type.toUpperCase()));
      var definition = MODIFIER_CARDS[type.toUpperCase()];
      require_saved_state(definition.type === type);
      if (remaining.has(type)) {
        remaining.set(type, remaining.get(type) - 1);
      }
      return define_modifier_card(definition);
    }
    deck.draw_pile = piles.draw_pile.map(restore_card);
    deck.discard = piles.discard.map(restore_card);
    remaining.forEach(function (count) {
      require_saved_state(count === 0);
    });
    [CARD_TYPES_MODIFIER.BLESS, CARD_TYPES_MODIFIER.CURSE].forEach(function (type) {
      require_saved_state(count_modifier_cards(deck, type) <= 10);
    });
    deck.split_draw = saved.split_draw;
  }
  return deck;
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
  if (modifier_shuffle_required(modifier_deck)) {
    reshuffle_modifier_deck(modifier_deck);
    commit_modifier_action(modifier_deck);
  }
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

function set_deck_visibility(deck, hidden) {
  deck.hidden = hidden;
  toggle_class(deck.deck_space, "hiddendeck", hidden);
  deck.stat_block.hidden = hidden;
}

function show_game(decks, modifier, options) {
  var tableau = document.getElementById("tableau");
  var current_decks = document.getElementById("currentdeckslist");
  var old_stats = document.getElementById("monster-stats-container");

  visible_ability_decks.forEach(function (deck) {
    tableau.removeChild(deck.deck_space);
  });
  if (old_stats) {
    tableau.removeChild(old_stats);
  }
  remove_child(current_decks);

  active_game = options;
  visible_ability_decks = decks;
  if (modifier_deck !== null) {
    window.clearTimeout(modifier_deck.shuffle_timer);
  }
  modifier_deck = modifier;
  mount_modifier_deck(modifier, options.show_modifier_deck);

  var stats_container = document.createElement("div");
  stats_container.id = "monster-stats-container";
  stats_container.className = "monster-stats-container";
  toggle_class(stats_container, "collapsed", options.stats_collapsed);
  stats_container.onclick = function () {
    options.stats_collapsed = this.classList.toggle("collapsed");
    save_app_state();
  };

  var placeholder = document.createElement("div");
  placeholder.className = "monster-stats-placeholder";
  placeholder.textContent = "Monster Stats";
  stats_container.appendChild(placeholder);
  tableau.appendChild(stats_container);

  decks.forEach(function (deck) {
    var deck_id = deck.name.replace(/\s+/g, "");
    var space = document.createElement("div");
    space.id = deck_id;
    space.className = "card-container";
    space.title = "Click to draw enemy ability";
    space.onclick = draw_ability_card.bind(null, deck);
    space.oncontextmenu = function (event) {
      event.preventDefault();
      set_deck_visibility(deck, true);
      save_app_state();
    };
    render_deck_piles(deck);
    place_deck(deck, space);
    tableau.appendChild(space);

    deck.stat_block = create_stat_block(deck);
    deck.stat_block.id = deck_id + "-stats";
    stats_container.appendChild(deck.stat_block);
    set_deck_visibility(deck, deck.hidden);

    var item = document.createElement("li");
    item.className = "currentdeck";
    var label = document.createElement("a");
    label.id = "switch-" + deck_id;
    label.href = "#switch-" + deck_id;
    label.innerText = deck.name;
    label.title = "Click to show/hide deck";
    label.onclick = function () {
      set_deck_visibility(deck, !deck.hidden);
      refresh_ui();
      save_app_state();
    };
    item.appendChild(label);
    current_decks.appendChild(item);
  });

  update_card_size();
}

function build_selected_decks(selection, existing_decks) {
  var selected = selection.map(function (entry) {
    return existing_decks.find(function (deck) {
      return deck.name === entry.name && deck.level === entry.level;
    });
  });
  var shared_decks = new Map();
  selected.forEach(function (deck) {
    if (deck) {
      shared_decks.set(deck.class, deck);
    }
  });
  return selection.map(function (entry, index) {
    if (selected[index]) {
      return selected[index];
    }
    var deck = create_ability_deck(entry.class, entry.name, entry.level);
    if (shared_decks.has(deck.class)) {
      set_ability_piles(deck, encode_piles(shared_decks.get(deck.class), "id"));
    } else {
      shuffle_list(deck.draw_pile);
      shared_decks.set(deck.class, deck);
    }
    return deck;
  });
}

function start_game(selection, options, reset) {
  var existing_decks = reset ? [] : visible_ability_decks;
  var existing_modifier = reset ? null : modifier_deck;
  var decks = build_selected_decks(selection, existing_decks);
  var modifier = existing_modifier === null ? create_modifier_deck(null) : existing_modifier;

  show_game(decks, modifier, options);
  if (existing_modifier === null) {
    play_shuffle_animation(modifier);
  }
  decks.forEach(function (deck) {
    if (!existing_decks.includes(deck) && deck.discard.length === 0) {
      play_shuffle_animation(deck);
    }
  });
  restore_failed = false;
}

function mount_modifier_deck(deck, show) {
  function init_counter(id, card_type) {
    var counter = document.getElementById(id);
    counter.querySelector(".increment").onclick = change_modifier_card.bind(null, deck, card_type, 1);
    counter.querySelector(".decrement").onclick = change_modifier_card.bind(null, deck, card_type, -1);
  }

  var container = document.getElementById("modifier-container");
  container.hidden = !show;
  var space = document.getElementById("modifier-deck-space");
  space.classList.remove("shuffle-animation");
  remove_child(space);
  render_deck_piles(deck);
  place_deck(deck, space);
  space.onclick = draw_modifier_card.bind(null, deck);

  init_counter("bless-counter", CARD_TYPES_MODIFIER.BLESS);
  init_counter("curse-counter", CARD_TYPES_MODIFIER.CURSE);
  document.getElementById("end-round").onclick = end_round;
  container.querySelector(".draw-two").onclick = double_draw.bind(null, deck);
  container.querySelector(".draw-all").onclick = draw_all_monster_cards;
  update_modifier_controls(deck);
}

function update_modifier_controls(deck) {
  document.querySelector("#bless-counter .icon-text").textContent =
    count_modifier_cards(deck, CARD_TYPES_MODIFIER.BLESS);
  document.querySelector("#curse-counter .icon-text").textContent =
    count_modifier_cards(deck, CARD_TYPES_MODIFIER.CURSE);
  toggle_class(document.getElementById("end-round"), "not-required", !modifier_shuffle_required(deck));
}

function commit_modifier_action(deck) {
  update_modifier_controls(deck);
  save_app_state();
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
  name.textContent = deck.name;
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
  level_spinner.input.max = 7;
  level.html.appendChild(level_spinner.input);
  level.spinner = level_spinner.input;

  level.get_selection = function () {
    var value = this.spinner.value;
    var level = Number(value);
    if (value === "" || !valid_monster_level(level)) {
      throw new Error("Select a monster level from 0 to 7.");
    }
    return level;
  };

  level.set_value = function (value) {
    this.spinner.value = value;
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
    try {
      var level = decklist.global_level_selector.get_selection();
      Object.values(decklist.level_selectors).forEach(function (selector) {
        selector.set_value(level);
      });
      save_app_state();
    } catch (error) {
      report_state_error("Could not apply the global level.", error);
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
    return this.get_selection().map(function (name) {
      return {
        name: name,
        class: DECKS[name].class,
        level: decklist.level_selectors[name].get_selection(),
      };
    });
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

  scenariolist.get_number = function () {
    var number = Number(this.spinner.value);
    if (!Number.isInteger(number) || number < 1 || number > scenarios.length) {
      throw new Error("Select a scenario number from 1 to " + scenarios.length + ".");
    }
    return number;
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
        base_level + SPECIAL_RULES.living_corpse_two_levels_extra.extra_levels
      );
    } else {
      return base_level;
    }
  };

  scenariolist.get_scenario_decks = function () {
    var index = this.get_number() - 1;
    var special_rules = this.special_rules[index];
    return this.decks[index].map(function (deck) {
      return {
        name: deck.name,
        class: get_ability_class(deck.name),
        level: scenariolist.get_level(deck.name, special_rules),
      };
    });
  };

  return scenariolist;
}

function get_ability_class(name) {
  if (Object.hasOwn(DECKS, name)) {
    return DECKS[name].class;
  }
  if (name.startsWith("Boss: ") && Object.hasOwn(MONSTER_STATS.bosses, name.slice(6))) {
    return DECKS.Boss.class;
  }
}

function report_state_error(message, error) {
  var notice = document.getElementById("save-error");
  notice.textContent = message + " " + error.message;
  notice.hidden = false;
  console.error(message, error);
}

function save_app_state() {
  if (restore_failed) {
    return;
  }
  try {
    var game = active_game === null ? null :
      encode_game(active_game, visible_ability_decks, modifier_deck);
    write_app_state(game, get_view_state(settings_controls));
    document.getElementById("applyload").disabled = game === null;
    document.getElementById("save-error").hidden = true;
  } catch (error) {
    report_state_error("Could not save the app state.", error);
  }
}

function restore_app_state() {
  var saved = read_app_state();
  if (saved === null) {
    return;
  }
  var game = saved.game === null ? null : decode_game(saved.game);
  restore_view_state(saved.view, settings_controls);
  if (game !== null) {
    show_game(game.decks, game.modifier, game.options);
  }
}

function save_preference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    report_state_error("Could not save the setting.", error);
  }
}

function init() {
  init_ui();
  var deckspage = document.getElementById("deckspage");
  var scenariospage = document.getElementById("scenariospage");
  var applydeckbtn = document.getElementById("applydecks");
  var applyscenariobtn = document.getElementById("applyscenario");
  var applyloadbtn = document.getElementById("applyload");
  var enableanimations = document.getElementById("enableanimations");
  var decklist = new DeckList();
  var scenariolist = new ScenarioList(SCENARIO_DEFINITIONS);
  deckspage.insertAdjacentElement("afterbegin", decklist.ul);
  scenariospage.insertAdjacentElement("afterbegin", scenariolist.ul);
  settings_controls = get_settings_fields(decklist, scenariolist);

  try {
    var size = localStorage.getItem("card_size_factor");
    if (size !== null) {
      var factor = Number(size);
      require_saved_state(Number.isFinite(factor) && factor >= 0.1);
      card_size_factor = factor;
    }
    var animation = localStorage.getItem("draw_animation_enabled");
    require_saved_state(animation === null || animation === "true" || animation === "false");
    draw_animation_enabled = animation !== "false";
  } catch (error) {
    report_state_error("Could not restore the settings.", error);
  }

  try {
    restore_app_state();
  } catch (error) {
    restore_failed = true;
    report_state_error("Could not restore the app state.", error);
  }

  if (active_game === null) {
    update_card_size();
  }
  applyloadbtn.disabled = active_game === null;
  enableanimations.checked = draw_animation_enabled;
  toggle_class(document.body, "no-animation", !draw_animation_enabled);
  enableanimations.onchange = function () {
    draw_animation_enabled = this.checked;
    toggle_class(document.body, "no-animation", !draw_animation_enabled);
    save_preference("draw_animation_enabled", draw_animation_enabled);
  };
  Object.values(settings_controls).forEach(function (field) {
    field.oninput = save_app_state;
  });

  applydeckbtn.onclick = function () {
    try {
      var selection = decklist.get_selected_decks();
      start_game(selection, {
        scenario: null,
        show_modifier_deck: settings_controls.custom_modifier.checked,
        stats_collapsed: active_game !== null && active_game.stats_collapsed,
      }, false);
      save_app_state();
    } catch (error) {
      report_state_error("Could not apply the deck selection.", error);
    }
  };

  applyscenariobtn.onclick = function () {
    try {
      var selection = scenariolist.get_scenario_decks();
      var scenario = {
        number: scenariolist.get_number(),
        level: scenariolist.level_selector.get_selection(),
      };
      start_game(selection, {
        scenario: scenario,
        show_modifier_deck: settings_controls.scenario_modifier.checked,
        stats_collapsed: false,
      }, true);
      decklist.set_selection(selection);
      show_settingspane(false);
      save_app_state();
    } catch (error) {
      report_state_error("Could not apply the scenario.", error);
    }
  };

  applyloadbtn.onclick = function () {
    try {
      var game = decode_game(read_app_state().game);
      show_game(game.decks, game.modifier, game.options);
      decklist.set_selection(game.decks);
      if (game.options.scenario !== null) {
        scenariolist.spinner.value = game.options.scenario.number;
        scenariolist.level_selector.set_value(game.options.scenario.level);
      }
      settings_controls.scenario_modifier.checked = game.options.show_modifier_deck;
      settings_controls.custom_modifier.checked = game.options.show_modifier_deck;
      save_app_state();
    } catch (error) {
      report_state_error("Could not load the previous scenario.", error);
    }
  };

  function set_card_size(value) {
    card_size_factor = value;
    update_card_size();
    save_preference("card_size_factor", card_size_factor);
  }
  document.getElementById("cardsizeplus").onclick = function () {
    set_card_size(card_size_factor + 0.1);
  };
  document.getElementById("cardsizeminus").onclick = function () {
    set_card_size(Math.max(0.1, card_size_factor - 0.1));
  };
  document.getElementById("cardsizereset").onclick = function () {
    set_card_size(DEFAULT_CARD_SIZE_FACTOR);
  };
  window.onresize = refresh_ui;
}

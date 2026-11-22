var APP_STATE_KEY = "gloomycompanion.state";
var APP_STATE_VERSION = 1;

function require_saved_state(condition) {
  if (!condition) {
    throw new Error("The saved game is incomplete or invalid.");
  }
}

function read_app_state() {
  var saved = localStorage.getItem(APP_STATE_KEY);
  if (saved === null) {
    if (localStorage.getItem("selected_deck_names") !== null) {
      throw new Error("The previous save cannot be restored exactly. Apply a scenario or deck selection to start a new game.");
    }
    return null;
  }

  var state = JSON.parse(saved);
  if (!state || state.version !== APP_STATE_VERSION) {
    throw new Error("This saved game uses an unsupported format.");
  }
  require_saved_state(state.view && (state.game === null || state.game));
  return state;
}

function write_app_state(game, view) {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify({
    version: APP_STATE_VERSION,
    game: game,
    view: view,
  }));
}

function encode_piles(deck, card_key) {
  function encode_card(card) {
    return card[card_key];
  }
  return {
    draw_pile: deck.draw_pile.map(encode_card),
    discard: deck.discard.map(encode_card),
  };
}

function set_ability_piles(deck, piles) {
  var cards = [];
  deck.draw_pile.concat(deck.discard).forEach(function (card) {
    cards[card.id] = card;
  });
  require_saved_state(piles && Array.isArray(piles.draw_pile) && Array.isArray(piles.discard));
  var order = piles.draw_pile.concat(piles.discard);
  require_saved_state(order.length === cards.length && new Set(order).size === cards.length);

  function find_card(id) {
    require_saved_state(Number.isInteger(id) && id >= 0 && id < cards.length);
    return cards[id];
  }
  deck.draw_pile = piles.draw_pile.map(find_card);
  deck.discard = piles.discard.map(find_card);
}

function decode_game(saved) {
  require_saved_state(Array.isArray(saved.decks) && saved.modifier &&
    typeof saved.show_modifier_deck === "boolean" &&
    typeof saved.stats_collapsed === "boolean");
  var scenario = saved.scenario;
  require_saved_state(scenario === null || (scenario &&
    Number.isInteger(scenario.number) && scenario.number >= 1 &&
    scenario.number <= SCENARIO_DEFINITIONS.length && valid_monster_level(scenario.level)));

  var names = new Set();
  var class_piles = new Map();
  var decks = saved.decks.map(function (entry) {
    require_saved_state(entry && typeof entry.name === "string" &&
      typeof entry.hidden === "boolean" && valid_monster_level(entry.level));
    var deck_class = get_ability_class(entry.name);
    require_saved_state(deck_class && entry.class === deck_class && !names.has(entry.name));
    names.add(entry.name);

    var deck = create_ability_deck(deck_class, entry.name, entry.level);
    set_ability_piles(deck, entry.piles);
    var piles = JSON.stringify(encode_piles(deck, "id"));
    require_saved_state(!class_piles.has(deck_class) || class_piles.get(deck_class) === piles);
    class_piles.set(deck_class, piles);
    deck.hidden = entry.hidden;
    return deck;
  });

  return {
    decks: decks,
    modifier: create_modifier_deck(saved.modifier),
    options: {
      scenario: scenario,
      show_modifier_deck: saved.show_modifier_deck,
      stats_collapsed: saved.stats_collapsed,
    },
  };
}

function valid_monster_level(level) {
  return Number.isInteger(level) && level >= 0 && level <= 7;
}

function encode_game(options, decks, modifier) {
  return {
    scenario: options.scenario,
    show_modifier_deck: options.show_modifier_deck,
    stats_collapsed: options.stats_collapsed,
    decks: decks.map(function (deck) {
      return {
        class: deck.class,
        name: deck.name,
        level: deck.level,
        hidden: deck.hidden,
        piles: encode_piles(deck, "id"),
      };
    }),
    modifier: {
      piles: encode_piles(modifier, "card_type"),
      split_draw: modifier.split_draw,
    },
  };
}

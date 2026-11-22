var settingspane;
var cancelarea;
var active_settings_tab;
var settings_tabs;
var settings_pages;

function activate_tab(tab) {
  Object.keys(settings_tabs).forEach(function (key) {
    toggle_class(settings_tabs[key], "inactive", key !== tab);
    settings_pages[key].hidden = key !== tab;
  });
  active_settings_tab = tab;
}

function show_settingspane(show) {
  toggle_class(settingspane, "inactive", !show);
  cancelarea.style.display = show ? "initial" : "none";
}

function init_ui() {
  function close_settings() {
    show_settingspane(false);
    save_app_state();
  }

  settings_tabs = {
    scenarios: document.getElementById("scenariotab"),
    decks: document.getElementById("deckstab"),
  };
  settings_pages = {
    scenarios: document.getElementById("scenariospage"),
    decks: document.getElementById("deckspage"),
  };
  settingspane = document.getElementById("settingspane");
  cancelarea = document.getElementById("cancelarea");

  Object.keys(settings_tabs).forEach(function (tab) {
    settings_tabs[tab].onclick = function () {
      activate_tab(tab);
      save_app_state();
    };
  });
  document.getElementById("settingsbtn").onclick = function () {
    show_settingspane(true);
    save_app_state();
  };
  cancelarea.onclick = close_settings;
  document.getElementById("close-settings").onclick = close_settings;
  activate_tab("scenarios");
}

function get_settings_fields(decklist, scenariolist) {
  var fields = {
    scenario_number: scenariolist.spinner,
    scenario_level: scenariolist.level_selector.spinner,
    global_level: decklist.global_level_selector.spinner,
    scenario_modifier: document.getElementById("showmodifierdeck"),
    custom_modifier: document.getElementById("showmodifierdeck-deckspage"),
  };
  Object.keys(decklist.checkboxes).forEach(function (name) {
    fields["selected:" + name] = decklist.checkboxes[name];
    fields["level:" + name] = decklist.level_selectors[name].spinner;
  });
  return fields;
}

function update_tableau_visibility(decks, show_modifier) {
  var show_stats = decks.some(function (deck) {
    return !deck.hidden;
  });
  document.getElementById("monster-stats-container").hidden = !show_stats;

  var empty_tableau = document.getElementById("empty-tableau");
  empty_tableau.hidden = show_stats || show_modifier;
  if (!empty_tableau.hidden) {
    empty_tableau.textContent = decks.length > 0
      ? "All monster decks are hidden. Select a monster name to show its deck."
      : "Choose a scenario or decks in Settings.";
  }
}

function get_view_state(fields) {
  var values = {};
  Object.keys(fields).forEach(function (key) {
    var field = fields[key];
    values[key] = field.type === "checkbox" ? field.checked : field.value;
  });
  return {
    tab: active_settings_tab,
    settings_open: !settingspane.classList.contains("inactive"),
    fields: values,
  };
}

function restore_view_state(view, fields) {
  require_saved_state(view && has_own(settings_tabs, view.tab) &&
    typeof view.settings_open === "boolean" && view.fields);
  var keys = Object.keys(fields);
  keys.forEach(function (key) {
    var type = fields[key].type === "checkbox" ? "boolean" : "string";
    require_saved_state(typeof view.fields[key] === type);
  });
  keys.forEach(function (key) {
    var field = fields[key];
    if (field.type === "checkbox") {
      field.checked = view.fields[key];
    } else {
      field.value = view.fields[key];
    }
  });
  activate_tab(view.tab);
  show_settingspane(view.settings_open);
}

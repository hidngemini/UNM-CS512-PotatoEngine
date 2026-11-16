// Generalized interface to allow editing properties
// of stuff in the scene on the fly.

import { hex, rgbToHex } from "../util/color";

// TODO: objects of interest:
//       - sceneobject
//       - materials
//       - light
//       - shaderprograms?
//       - textures?
//       - camera

export const TYPE_MATERIAL_SELECTOR = "material_selector";
export const TYPE_PROGRAM_SELECTOR = "program_selector";
export const TYPE_OBJECT_SELECTOR = "object_selector";
export const TYPE_3TUPLE_SELECTOR = "3tuple_selector";
export const TYPE_COLOR_SELECTOR = "color_selector";
export const TYPE_READ_ONLY = "readonly";

// set of property types that cannot be inferred from
// the type of the value in the object (or that im too lazy to check for)
const PROPERTY_TYPES = {
  materialLabel: TYPE_MATERIAL_SELECTOR,
  materialLabelSecondary: TYPE_MATERIAL_SELECTOR,
  parent: TYPE_OBJECT_SELECTOR,
};

// current target of the editor panel
// could be an object, material, etc
let activeTarget;
// sync functions to call to update the panel readouts
let activeSync;

/**
 * Generate a function to update the property noted in the target
 * object...
 * @param {*} target
 * @param {*} property
 * @param {*} secondaryProperty
 * @param {*} cast casting function
 * @returns
 */
function updatePropertyHandler(
  target,
  property,
  secondaryProperty = undefined,
  cast = undefined,
) {
  return function (event) {
    let val =
      event.target.type === "checkbox"
        ? event.target.checked
        : event.target.value;

    if (cast) {
      val = cast(val);
    }

    // 0 gets caught by my normal !! check
    if (secondaryProperty !== undefined) {
      target[property][secondaryProperty] = val;
    } else {
      target[property] = val;
    }
  };
}

/**
 * Parse the properties given into a usable format
 * - should attach this information to the classes so we can
 *   just chuck it in as needed
 *
 * @param {*} properties
 */
function parseProperties(properties) {
  if (Array.isArray(properties)) {
    return properties.map((item) => {
      // pack property string into object
      return typeof item == "string" ? { name: item } : item;
    });
  }

  return Object.entries(properties).map(([name, config]) => {
    return typeof config == "string"
      ? { name, type: config }
      : { name, ...config };
  });
}

/**
 * Figure out the property type from the target
 * @param {*} target
 * @param {string} property
 * @param {*} forceType
 */
function parsePropertyType(target, property, forceType = undefined) {
  if (forceType) {
    return forceType;
  }

  if (PROPERTY_TYPES[property]) {
    return PROPERTY_TYPES[property];
  }

  const val = target[property];
  switch (typeof val) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case Array.isArray(val) && val.length == 3:
      return TYPE_3TUPLE_SELECTOR;
  }

  return "string";
}

/**
 * Helper to grab the stuff from scene so its clean
 *
 * @param {Scene} scene
 * @param {string} type
 */
function getOptionsFromScene(scene, type) {
  switch (type) {
    case TYPE_MATERIAL_SELECTOR:
      return scene.materials.entries();
    case TYPE_OBJECT_SELECTOR:
      return scene.objects.entries();
    case TYPE_PROGRAM_SELECTOR:
      return scene.programs.entries();
  }
}

/**
 * Turn a property name into a title cased string
 * - TODO: be able to split camel cased property names
 * @param {string} str
 * @returns {string}
 */
function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Iterate through the properties noted for the target object
 * and make a panel interface that can update the values and
 * is updated by changes to the object.
 *
 * expected property types & what to make (these should all come with labels):
 * - string => make a text input to change it
 * - number => text input to change with number cast function attached
 * - bool => checkbox
 * - TYPE_MATERIAL_SELECTOR => query the materials in the scene and create a select input (scene.materials (map) & materials have .label attribute)
 * - TYPE_OBJECT_SELECTOR => query the objects in the scene and create a select input (scene.objects  (map) & objects have .label attribute)
 * - TYPE_PROGRAM_SELECTOR => query the programs in the scene and create a select input (scene.program  (map) & program have .label attribute)
 * - TYPE_3TUPLE_SELECTOR => make a grouped set of 3 inputs (use the secondary property for array index)
 * - TYPE_COLOR_SELECTOR => color selector
 *
 * @param {Object} target
 * @param {*} properties
 * @param {Scene} scene
 */
export function createPanel(
  target,
  properties,
  scene,
  panel = document.getElementById("editor-panel-body"),
) {
  if (!panel) {
    throw new Error("Expected #editor-panel-body");
  }

  properties ??= target?.constructor?.EDITOR_PROPERTIES ?? properties;

  panel.innerHTML = "";
  activeTarget = target;
  activeSync = new Map();

  const header = document.createElement("h3");
  header.className = "h6 mb-3 pb-2 border-bottom";
  header.innerText = `${target.constructor.name}: "${target.label}"`;
  panel.appendChild(header);

  for (const config of parseProperties(properties)) {
    const property = config.name;
    if (!property) continue;

    const row = document.createElement("div");
    row.className = "row g-2 align-items-center mb-2";

    const label = document.createElement("label");
    label.className = "col-4 form-label small text-secondary mb-0";
    label.innerText = property;
    row.appendChild(label);

    const control = document.createElement("div");
    control.className = "col-8";

    let syncFunction;
    const type = parsePropertyType(target, property, config.type);

    if (
      type === TYPE_MATERIAL_SELECTOR ||
      type === TYPE_OBJECT_SELECTOR ||
      type === TYPE_PROGRAM_SELECTOR
    ) {
      const select = document.createElement("select");
      select.className = "form-select form-select-sm";

      const options = getOptionsFromScene(scene, type);
      options.forEach(([key, item]) => {
        const option = document.createElement("option");
        option.value = key;
        option.innerText = item.label;
        select.appendChild(option);
      });

      select.addEventListener("input", (event) => {
        target[property] = event.target.value;
      });

      syncFunction = () => {
        select.value = target[property];
      };

      control.appendChild(select);
    } else if (type === TYPE_READ_ONLY) {
      const value = document.createElement("p");
      value.className = "form-control-plaintext form-control-sm py-0 mb-0";

      syncFunction = () => {
        value.innerText = target[property];
      };

      control.appendChild(value);
    } else if (type === TYPE_3TUPLE_SELECTOR) {
      const group = document.createElement("div");
      group.className = "d-flex gap-1";

      for (let i = 0; i < 3; i++) {
        const input = document.createElement("input");
        input.className = "form-control form-control-sm";
        input.type = "number";
        input.step = "any";
        input.setAttribute("aria-label", `${property} ${i + 1}`);
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property, i, Number),
        );
        group.appendChild(input);
      }

      syncFunction = () => {
        [...group.children].forEach((input, i) => {
          input.value = target[property]?.[i] ?? "";
        });
      };

      control.appendChild(group);
    } else {
      const input = document.createElement("input");
      input.className = "form-control form-control-sm";

      if (type === "boolean") {
        input.type = "checkbox";
        input.classList.add("form-check-input", "mt-0");

        syncFunction = () => {
          input.checked = Boolean(target[property]);
        };
      } else if (type === "number") {
        input.type = "number";
        input.step = "any";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property, undefined, Number),
        );

        syncFunction = () => {
          input.value = target[property] ?? "";
        };
      } else if (type === "string") {
        input.type = "text";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property),
        );

        syncFunction = () => {
          input.value = target[property] ?? "";
        };
      } else if (type === TYPE_COLOR_SELECTOR) {
        input.type = "color";
        input.classList.add("form-control-color", "p-1");
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property, undefined, hex),
        );

        syncFunction = () => {
          input.value = rgbToHex(target[property]) ?? "";
        };
      }

      control.appendChild(input);
    }

    row.appendChild(control);
    panel.appendChild(row);
    activeSync.set(property, syncFunction);
    syncFunction();
  }

  return panel;
}

/**
 * Sync the currenty properties in the target
 */
export function syncProperties() {
  for (const sync of activeSync.values()) {
    sync();
  }
}

/**
 * make the editor tab layout, tabs for:
 * - default controls (defined in the html)
 * - objects
 * - lights
 * - materials
 * - textures
 * - programs
 * - camera settings
 * - scene settings
 *
 * then on these tabs you can select from the dropdown and then use createPanel
 * to populate the editor for that type
 *
 * @param {Scene} scene
 * @param {Object} [options={}]
 * @param {HTMLElement | null} [options.container=document.getElementById("editor-panel-body")]
 * @param {HTMLElement | null} [options.defaultControls=document.getElementById("default-editor-controls")]
 */
export function makeEditorTabs(
  scene,
  {
    container = document.getElementById("editor-panel-body"),
    defaultControls = document.getElementById("default-editor-controls"),
  } = {},
) {
  if (!container) {
    throw new Error("Expected #editor-panel-body");
  }

  container.innerHTML = "";

  // make the tab selector area
  const tabList = document.createElement("div");
  tabList.className = "nav nav-tabs";
  tabList.setAttribute("role", "tablist");
  const tabContent = document.createElement("div");
  tabContent.className = "tab-content";
  container.append(tabList, tabContent);

  // collection of tabs
  //  id => {button, pane, render}
  const tabs = new Map();

  /**
   * Add a new tab to the map
   * @param {string} id event id
   * @param {string} label human label
   * @param {function} render callback function to use to render the content in
   * @returns
   */
  function addTab(id, label, render = null) {
    const button = document.createElement("button");
    button.className = "nav-link";
    button.type = "button";
    button.id = `${id}-tab`;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${id}-pane`);
    button.setAttribute("aria-selected", "false");

    const pane = document.createElement("div");
    pane.className = "tab-pane";
    pane.id = `${id}-pane`;
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", button.id);
    pane.hidden = true;

    button.addEventListener("click", () => activateTab(id));

    tabList.appendChild(button);
    tabContent.appendChild(pane);
    tabs.set(id, { button, pane, render });

    return pane;
  }

  /**
   * Activate a tab, ie update the tab classes & attribs, render in the content
   * if needed
   * @param {string} id
   */
  function activateTab(id) {
    for (const [tabId, tab] of tabs) {
      const active = tabId === id;
      tab.button.classList.toggle("active", active);
      tab.button.setAttribute("aria-selected", String(active));
      tab.pane.hidden = !active;
      if (active) {
        tab.pane.classList.add("active");
      } else {
        tab.pane.classList.remove("active");
      }
    }
    // clear the sync functions right away so we dont get any mess happening
    activeSync = new Map();
    tabs.get(id)?.render?.();
  }

  /**
   * Add a new selector tab (a tab that allows you to select from a collection)
   * these collections are nominally all selected from the scene, but there is
   * no reason you couldnt throw another collection in there to debug
   * @param {string} id event id
   * @param {string} label  human label
   * @param {*} collection  the collection to read data from (map from scene.something)
   * @returns
   */
  function addSelectorTab(id, label, collection) {
    const pane = addTab(id, label);

    // initial select region
    const select = document.createElement("select");
    select.className = "form-select";
    select.setAttribute("aria-label", `Select ${label.toLowerCase()}`);
    const propertyPanel = document.createElement("div");
    propertyPanel.className = "mt-1";

    pane.append(select, propertyPanel);

    const entries = collection ? [...collection.entries()] : [];

    if (entries.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = `No ${label.toLowerCase()} available`;
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    // will have to update this for entries that get added on the fly
    // like new objects in the scene, but this should do for now
    entries.forEach(([, item], index) => {
      const option = document.createElement("option");
      option.value = String(index);
      // in case there isnt a label on a collection type we throw in
      option.textContent =
        item.label ?? `Unlabeled ${label.toLowerCase()} ${index} `;
      select.appendChild(option);
    });

    /**
     * Render the selected entry into the editor pabel
     */
    function renderSelected() {
      const entry = entries[Number(select.value)];

      if (!entry) {
        propertyPanel.innerHTML = "";
        return;
      }

      const [, item] = entry;
      createPanel(item, undefined, scene, propertyPanel);
    }

    select.addEventListener("change", () => {
      if (!pane.hidden) {
        renderSelected();
      }
    });

    tabs.get(id).render = renderSelected;
  }

  // default controls pane pulled from the html content
  // this would be like demo specific controls
  const controlsPane = addTab("default-controls", "Controls");
  if (defaultControls) {
    controlsPane.appendChild(defaultControls);
  }

  // add all the generic selector tabs
  addSelectorTab("objects", "Objects", scene.objects);
  addSelectorTab("lights", "Lights", scene.lights);
  addSelectorTab("materials", "Materials", scene.materials);
  addSelectorTab("textures", "Textures", scene.textures);
  addSelectorTab("programs", "Programs", scene.programs);

  // add the two single instance tabs
  const cameraPane = addTab("camera-settings", "Camera");
  const cameraPropertyPanel = document.createElement("div");
  cameraPane.appendChild(cameraPropertyPanel);
  tabs.get("camera-settings").render = () => {
    createPanel(scene.camera, undefined, scene, cameraPropertyPanel);
  };

  const scenePane = addTab("scene-settings", "Scene");
  const scenePropertyPanel = document.createElement("div");
  scenePane.appendChild(scenePropertyPanel);
  tabs.get("scene-settings").render = () => {
    createPanel(scene, undefined, scene, scenePropertyPanel);
  };

  activateTab("default-controls");
}

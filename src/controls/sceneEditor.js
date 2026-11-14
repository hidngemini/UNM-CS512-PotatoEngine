// Generalized interface to allow editing properties
// of stuff in the scene on the fly.

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

    if (!!secondaryProperty) {
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
    case Array.isArray(value) && val.length == 3:
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
 * @param {*} target
 * @param {*} properties
 * @param {Scene} scene
 */
export function createPanel(target, properties, scene) {
  const panel = document.getElementById("editor-panel-body");
  if (!panel) {
    throw new Error("Expected #editor-panel-body");
  }
  panel.innerHTML = "";
  activeTarget = target;
  activeSync = new Map();

  for (const config of parseProperties(properties)) {
    const property = config.name;
    if (!property) {
      continue;
    }

    // TODO add the bootstrap grid css to common repo
    //      so i can use it here easily, maybe add some
    //      of the input styles?
    const row = document.createElement("div");
    row.classList.add("row");

    const label = document.createElement("label");
    label.innerText = titleCase(property);
    row.appendChild(label);

    let syncFunction;

    const type = parsePropertyType(target, property, config.type);

    if (
      type == TYPE_MATERIAL_SELECTOR ||
      type == TYPE_OBJECT_SELECTOR ||
      type == TYPE_PROGRAM_SELECTOR
    ) {
    } else if (type == TYPE_3TUPLE_SELECTOR) {
    } else {
      // all the standard input items
      const input = document.createElement("input");

      if (type == "boolean") {
        input.type = "checkbox";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property),
        );
        syncFunction = () => {
          input.checked = Boolean(target[property]);
        };
      } else if (type == "number") {
        input.type = "number";
        input.step = "any";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property, undefined, Number),
        );
        syncFunction = () => {
          input.value = target[property] ?? "";
        };
      } else if (type == "string") {
        input.type = "text";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property),
        );
        syncFunction = () => {
          input.value = target[property] ?? "";
        };
      } else if (type == TYPE_COLOR_SELECTOR) {
        input.type = "color";
        input.addEventListener(
          "input",
          updatePropertyHandler(target, property, undefined),
        );
        syncFunction = () => {
          input.value = target[property] ?? "";
        };
      }

      row.appendChild(input);
    }

    panel.appendChild(row);
    activeSync.set(property, syncFunction);
    syncFunction();
  }

  return panel;
}

/**
 * Sync the currenty properties in the target
 */
function syncProperties() {
  for (const sync of activeSync.values()) {
    sync();
  }
}

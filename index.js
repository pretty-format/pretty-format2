// @flow
'use strict';

const ansiStyles = require('ansi-styles');

/*::
export type Colors = {
  comment: {close: string, open: string},
  content: {close: string, open: string},
  prop: {close: string, open: string},
  tag: {close: string, open: string},
  value: {close: string, open: string},
};

export type Plugin = {
  test(value: mixed): boolean,
  printOptimized?: (
    val: any,
    stack: Stack,
    env: Env,
    refs: Refs,
  ) => mixed,
  print?: (
    val: any,
    serialize: mixed => string,
    indent: string => string,
    opts: Options,
    colors: Colors,
  ) => string,
};

export type Plugins = Array<Plugin>;

export type InitialTheme = {
  comment?: string,
  content?: string,
  prop?: string,
  tag?: string,
  value?: string,
};

export type InitialOptions = {
  callToJSON?: boolean,
  escapeRegex?: boolean,
  edgeSpacing?: string,
  highlight?: boolean,
  indent?: number,
  maxDepth?: number,
  min?: boolean,
  plugins?: Plugins,
  printFunctionName?: boolean,
  spacing?: string,
  theme?: InitialTheme,
};

export type Options = {|
  callToJSON: boolean,
  edgeSpacing: string,
  escapeRegex: boolean,
  highlight: boolean,
  indent: number,
  maxDepth: number,
  min: boolean,
  plugins: Plugins,
  printFunctionName: boolean,
  spacing: string,
  theme: {|
    comment: string,
    content: string,
    prop: string,
    tag: string,
    value: string,
  |},
|};

export type Env = {
  opts: Options,
  colors: Colors,
};
*/

const toString = Object.prototype.toString;
const toISOString = Date.prototype.toISOString;
const errorToString = Error.prototype.toString;
const regExpToString = RegExp.prototype.toString;
const symbolToString = Symbol.prototype.toString;
const getSymbols = Object.getOwnPropertySymbols || (obj => []);

const TRUE_VAL = true;
const FALSE_VAL = false;
const NULL_VAL = null;

const UNDEFINED_TYPE = 'undefined';
const STRING_TYPE = 'string';
const NUMBER_TYPE = 'number';
const SYMBOL_TYPE = 'symbol';
const FUNCTION_TYPE = 'function';

const WEAKMAP_STR = '[object WeakMap]';
const WEAKSET_STR = '[object WeakSet]';
const FUNCTION_STR = '[object Function]';
const GENERATOR_STR = '[object GeneratorFunction]';
const SYMBOL_STR = '[object Symbol]';
const DATE_STR = '[object Date]';
const ERROR_STR = '[object Error]';
const REGEXP_STR = '[object RegExp]';
const ARGUMENTS_STR = '[object Arguments]';
const MAP_STR = '[object Map]';
const SET_STR = '[object Set]';

const CIRCULAR_STR = '[Circular]';

const ARRAY_LIKE_TYPES = {
  '[object Arguments]': 'Arguments',
  '[object Array]': 'Array',
  '[object ArrayBuffer]': 'ArrayBuffer',
  '[object DataView]': 'DataView',
  '[object Float32Array]': 'Float32Array',
  '[object Float64Array]': 'Float64Array',
  '[object Int8Array]': 'Int8Array',
  '[object Int16Array]': 'Int16Array',
  '[object Int32Array]': 'Int32Array',
  '[object Uint8Array]': 'Uint8Array',
  '[object Uint8ClampedArray]': 'Uint8ClampedArray',
  '[object Uint16Array]': 'Uint16Array',
  '[object Uint32Array]': 'Uint32Array',
};

const NEWLINE = '\n';
const EMPTY = '';
const SPACE = ' ';
const QUOTE = '"';
const OPEN_BRACKET = '[';
const CLOSE_BRACKET = ']';

const TRUE_PRINTED = 'true';
const FALSE_PRINTED = 'false';
const NULL_PRINTED = 'null';
const UNDEFINED_PRINTED = 'undefined';
const WEAKMAP_PRINTED = 'WeakMap {}';
const WEAKSET_PRINTED = 'WeakSet {}';
const NAN_PRINTED = 'NaN';
const NEGATIVE_ZERO_PRINTED = '-0';
const FUNCTION_PRINTED = '[Function]';
const ANONYMOUS_PRINTED = 'anonymous';
const MAP_MAX_PRINTED = '[Map]';
const SET_MAX_PRINTED = '[Set]';
const OBJECT_MAX_PRINTED = '[Object]';
const FUNCTION_OPEN_PRINTED = '[Function ';
const ARRAY_LIKE_EMPTY_PRINTED = ' []';

const NEWLINE_REGEXP = /\n/gi;

const STRING_REGEXP = /"|\\/g;
const STRING_REPLACE = '\\$&';

const SYMBOL_REGEXP = /^Symbol\((.*)\)(.*)$/;
const SYMBOL_REPLACE = 'Symbol($1)';

// https://github.com/benjamingr/RegExp.escape/blob/master/polyfill.js
const REGEXP_ESCAPE_REGEXP = /[\\^$*+?.()|[\]{}]/g;
const REGEXP_ESCAPE_REPLACE = '\\$&';

const INDENT_CACHE = {};

function createIndent(n) {
  return INDENT_CACHE[n] || (INDENT_CACHE[n] = SPACE.repeat(n));
}

// Warming up cache...
createIndent(0);
createIndent(2);
createIndent(4);
createIndent(6);
createIndent(8);
createIndent(10);

const CHAR_CACHE = {};

function Char(value) {
  this.value = value;
}

function createChar(value) {
  return CHAR_CACHE[value] || (CHAR_CACHE[value] = new Char(value));
}

const SPACE_CHAR = createChar(' ');
const QUOTE_CHAR = createChar('"');
const OPEN_BRACKET_CHAR = createChar('[');
const CLOSE_BRACKET_CHAR = createChar(']');
const OPEN_CURLY_CHAR = createChar('{');
const CLOSE_CURLY_CHAR = createChar('}');
const COMMA_CHAR = createChar(',');

const ARRAY_OPEN = createChar(' [');
const OBJECT_OPEN = createChar(' {');
const MAP_PRINTED_OPEN = createChar('Map {');
const SET_PRINTED_OPEN = createChar('Set {');
const MAP_JOIN = createChar(' => ');
const OBJECT_JOIN = createChar(': ');

const DOWN_OP = {op: 'DOWN'};
const UP_OP = {op: 'UP'};
const NEWLINE_OP = {op: 'NEWLINE'};

class Stack {
  /*::
  length: number;
  items: Array<any>;
  */

  constructor() {
    this.length = 0;
    this.items = [];
  }

  push(value /*: any */) {
    this.length = this.length + 1;
    this.items.push(value);
  }

  pop() /*: any */ {
    this.length = this.length - 1;
    return this.items.pop();
  }

  down() {
    this.push(DOWN_OP);
  }

  up() {
    this.push(UP_OP);
  }

  newLine() {
    this.push(NEWLINE_OP);
  }

  char(value /*: string */) {
    this.push(createChar(value));
  }
}

/*::
export type { Stack };
*/

class Refs {
  /*::
  layers: Array<Set<any>>;
  */

  constructor() {
    this.layers = [new Set()];
  }

  down() {
    this.layers.push(new Set());
  }

  up() {
    this.layers.pop();
  }

  add(value) {
    this.layers[this.layers.length - 1].add(value);
  }

  has(value) {
    // Start one level down so parallel references can exist
    let start = this.layers.length - 2;

    for (let i = start; i >= 0; i--) {
      if (this.layers[i].has(value)) {
        return true;
      }
    }

    return false;
  }
}

const series = /*::<Value, Context>*/(
  context /*: Context */,
  series /*: Array<Value> */,
  stack /*: Stack */,
  env /*: Env */,
  callback /*: (
    value: Value,
    index: number,
    length: number,
    context: Context,
    stack: Stack,
    env: Env
  ) => mixed */
) => {
  let length = series.length;

  for (let index = length - 1; index >= 0; index--) {
    let value = series[index];

    callback(value, index, length, context, stack, env);

    if (index > 0) {
      stack.newLine();
    }
  }
}

function seriesNested(context, array, stack, env, callback) {
  if (array.length > 0) {
    stack.newLine();
    stack.up();
    series(context, array, stack, env, callback);
    stack.newLine();
    stack.down();
  }
}

function printString(val) {
  return QUOTE + val.replace(STRING_REGEXP, STRING_REPLACE) + QUOTE;
}

function printNumber(val) {
  if (val != +val) return NAN_PRINTED;
  const isNegativeZero = val === 0 && 1 / val < 0;
  return isNegativeZero ? NEGATIVE_ZERO_PRINTED : EMPTY + val;
}

function printSymbol(val) {
  return symbolToString.call(val).replace(SYMBOL_REGEXP, SYMBOL_REPLACE);
}

function printDate(val) {
  return toISOString.call(val);
}

function printError(val) {
  return OPEN_BRACKET + errorToString.call(val) + CLOSE_BRACKET;
}

function printFunction(val, printFunctionName) {
  if (!printFunctionName) return FUNCTION_PRINTED;
  let name = val.name || ANONYMOUS_PRINTED;
  return FUNCTION_OPEN_PRINTED + name + CLOSE_BRACKET;
}

function printRegExp(val, escapeRegex) {
  let result = regExpToString.call(val);

  if (escapeRegex) {
    return result.replace(REGEXP_ESCAPE_REGEXP, REGEXP_ESCAPE_REPLACE);
  } else {
    return result;
  }
}

function printSeparator(separator, index, length, stack, env) {
  if (env.opts.min) {
    if (index !== length - 1) {
      stack.push(SPACE_CHAR);
      stack.push(separator);
    }
  } else {
    stack.push(separator);
  }
}

function printArrayLikeMember(value, index, length, context, stack, env) {
  printSeparator(COMMA_CHAR, index, length, stack, env);
  stack.push(value);
}

function printArrayLike(value, stack, env, matchedArrayLike) {
  stack.push(CLOSE_BRACKET_CHAR);
  seriesNested(value, value, stack, env, printArrayLikeMember);
  if (env.opts.min) {
    stack.push(OPEN_BRACKET_CHAR);
  } else {
    stack.push(ARRAY_OPEN);
    stack.push(new Char(matchedArrayLike));
  }
}

function printObjectMember(value, index, length, context, stack, env) {
  let val = context[value];
  printSeparator(COMMA_CHAR, index, length, stack, env);
  stack.push(val);
  stack.push(OBJECT_JOIN);
  stack.push(value);
}

function filterSymbol(val /*: mixed */) {
  let typeOf = typeof val;
  return typeOf !== 'symbol' && toString.call(val) !== '[object Symbol]';
}

function printObject(value, stack, env) {
  let keys = Object.keys(value).sort();
  let symbols /*: Array<any> */ = getSymbols(value);
  if (symbols.length) {
    keys = keys.filter(filterSymbol).concat(symbols);
  }
  stack.push(CLOSE_CURLY_CHAR);
  seriesNested(value, keys, stack, env, printObjectMember);
  if (env.opts.min) {
    stack.push(OPEN_CURLY_CHAR);
  } else {
    stack.push(OBJECT_OPEN);
    stack.push(new Char(typeof value.constructor === 'function' ? value.constructor.name : 'Object'));
  }
}

function printMapMember(value, index, length, context, stack, env) {
  printSeparator(COMMA_CHAR, index, length, stack, env);
  stack.push(value[1]);
  stack.push(MAP_JOIN);
  stack.push(value[0]);
}

function printMap(value, stack, env) {
  let items = Array.from(value.entries());
  stack.push(CLOSE_CURLY_CHAR);
  seriesNested(value, items, stack, env, printMapMember);
  stack.push(MAP_PRINTED_OPEN);
}

function printSetMember(value, index, length, context, stack, env) {
  printSeparator(COMMA_CHAR, index, length, stack, env);
  stack.push(value[1]);
}

function printSet(value, stack, env) {
  let items = Array.from(value.entries());
  stack.push(CLOSE_CURLY_CHAR);
  seriesNested(value, items, stack, env, printSetMember);
  stack.push(SET_PRINTED_OPEN);
}

function printLegacyPlugin(plugin, value, env, refs, depth) {
  let colors = env.colors;

  function print(value) {
    return printStack(value, depth + 1, refs, env);
  }

  function indent(str) {
    let indentation = createIndent((depth + 1) * env.opts.indent);
    return indentation + str;
  }

  const opts = {
    edgeSpacing: env.opts.edgeSpacing,
    min: env.opts.min,
    spacing: env.opts.spacing,
  };

  return plugin.print(value, print, indent, opts, colors);
}

function printPlugin(value, stack, env, refs, depth) {
  let plugins = env.opts.plugins;
  let plugin;

  for (let p = 0; p < plugins.length; p++) {
    let current = plugins[p];
    if (current.test(value)) {
      plugin = current;
      break;
    }
  }

  if (!plugin) return false;

  if (plugin.printOptimized) {
    plugin.printOptimized(value, stack, env, refs);
  } else if (plugin.print) {
    let result = printLegacyPlugin(plugin, value, env, refs, depth);
    stack.char(result);
  } else {
    throw new Error('Plugin must have either printOptimized() or print() method');
  }

  return true;
}

function printValue(value, stack, env, refs, depth) {
  if (env.opts.plugins.length) {
    let printed = printPlugin(value, stack, env, refs, depth);
    if (printed) return;
  }

  if (value === TRUE_VAL) return TRUE_PRINTED;
  if (value === FALSE_VAL) return FALSE_PRINTED;
  if (value === NULL_VAL) return NULL_PRINTED;

  let type = typeof value;

  if (type === UNDEFINED_TYPE) return UNDEFINED_PRINTED;
  if (type === STRING_TYPE) return printString(value);
  if (type === NUMBER_TYPE) return printNumber(value);
  if (type === SYMBOL_TYPE) return printSymbol(value);
  if (type === FUNCTION_TYPE) return printFunction(value, env.opts.printFunctionName);

  let str = toString.call(value);

  if (str === WEAKMAP_STR) return WEAKMAP_PRINTED;
  if (str === WEAKSET_STR) return WEAKSET_PRINTED;
  if (str === FUNCTION_STR || str === GENERATOR_STR) return printFunction(value, env.opts.printFunctionName);
  if (str === SYMBOL_STR) return printSymbol(value);
  if (str === DATE_STR) return printDate(value);
  if (str === ERROR_STR) return printError(value);
  if (str === REGEXP_STR) return printRegExp(value, env.opts.escapeRegex);

  if (refs.has(value)) {
    return CIRCULAR_STR;
  } else {
    refs.add(value);
  }

  let matchedArrayLike = ARRAY_LIKE_TYPES[str];
  let hitMaxDepth = depth >= env.opts.maxDepth;

  if (hitMaxDepth) {
    if (matchedArrayLike) return OPEN_BRACKET + matchedArrayLike + CLOSE_BRACKET;
    if (str === MAP_STR) return MAP_MAX_PRINTED;
    if (str === SET_STR) return SET_MAX_PRINTED;
    return OBJECT_MAX_PRINTED;
  }

  if (env.opts.callToJSON && typeof value.toJSON === 'function') {
    return printValue(value.toJSON(), stack, env, refs, depth);
  }

  if (matchedArrayLike) {
    if (value.length === 0) {
      return matchedArrayLike + ARRAY_LIKE_EMPTY_PRINTED;
    } else {
      printArrayLike(value, stack, env, matchedArrayLike);
    }
    return;
  }

  if (str === MAP_STR) {
    printMap(value, stack, env);
    return;
  }

  if (str === SET_STR) {
    printSet(value, stack, env);
    return;
  }

  if (value instanceof Error) {
    return printError(value);
  }

  return printObject(value, stack, env);
}

function printStack(value, depth, refs, env /*: Env */) {
  let result = '';
  let stack = new Stack();

  stack.push(value);

  while (stack.length) {
    let val = stack.pop();

    if (val instanceof Char) {
      result = result + val.value;
    } else if (val === DOWN_OP) {
      depth = depth + 1;
      refs.down();
    } else if (val === UP_OP) {
      depth = depth - 1;
      refs.up();
    } else if (val === NEWLINE_OP) {
      if (!env.opts.min) {
        result = result + NEWLINE + createIndent(depth * env.opts.indent);
      }
    } else {
      let res = printValue(val, stack, env, refs, depth);
      if (typeof res === 'string') result = result + res;
    }
  }

  return result;
}

const DEFAULTS /*: Options */ = {
  callToJSON: true,
  edgeSpacing: '\n',
  escapeRegex: false,
  highlight: false,
  indent: 2,
  maxDepth: Infinity,
  min: false,
  plugins: [],
  printFunctionName: true,
  spacing: '\n',
  theme: {
    comment: 'gray',
    content: 'reset',
    prop: 'yellow',
    tag: 'cyan',
    value: 'green',
  },
};

function validateOptions(opts) {
  Object.keys(opts).forEach(key => {
    if (!DEFAULTS.hasOwnProperty(key)) {
      throw new Error(`pretty-format: Unknown option "${key}".`);
    }
  });

  if (opts.min && opts.indent !== undefined && opts.indent !== 0) {
    throw new Error(
      'pretty-format: Options "min" and "indent" cannot be used together.'
    );
  }
}

function mergeOptions(opts) /*: Options */ {
  let result /*: any */ = {};

  Object.keys(DEFAULTS).forEach(key => {
    if (typeof opts[key] === UNDEFINED_TYPE) {
      result[key] = DEFAULTS[key];
    } else {
      result[key] = opts[key];
    }
  });

  return result;
}

function normalizeOptions(opts /*: ?InitialOptions */) /*: Options */ {
  let result;

  if (opts == null) {
    result = DEFAULTS;
  } else {
    validateOptions(opts);
    result = mergeOptions(opts);
  }

  if (result.min) {
    result.indent = 0;
  }

  return result;
}

function assertColor(key, val, color) {
  if (
    !color ||
    typeof color.close !== 'string' ||
    typeof color.open !== 'string'
  ) {
    throw new Error(
      `pretty-format: Option "theme" has a key "${key}" whose value "${val}" is undefined in ansi-styles.`
    );
  }
}

function createColors(opts) {
  let colors /*: Colors */ = {
    comment: {close: '', open: ''},
    content: {close: '', open: ''},
    prop: {close: '', open: ''},
    tag: {close: '', open: ''},
    value: {close: '', open: ''},
  };

  if (opts.highlight) {
    Object.keys(opts.theme).forEach(key => {
      let val = opts.theme[key];
      let color = ansiStyles[val];
      assertColor(key, val, color);
      colors[key] = color;
    });
  }

  return colors;
}

function prettyFormat(value /*: mixed */, options /*: ?InitialOptions */) {
  let opts = normalizeOptions(options);
  let colors = createColors(opts);

  let env = {opts, colors};
  let refs = new Refs();
  let depth = 0;

  return printStack(value, depth, refs, env);
}

prettyFormat.series = series;

module.exports = prettyFormat;

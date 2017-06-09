// @flow
'use strict';

const style = require('ansi-styles');

/*::
export type Colors = {
  comment: {close: string, open: string},
  content: {close: string, open: string},
  prop: {close: string, open: string},
  tag: {close: string, open: string},
  value: {close: string, open: string},
};

export type Plugin = (value: mixed, stack: Stack, env: Env) => void;
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

function Char(value) {
  this.value = value;
}

const SPACE_CHAR = new Char(' ');
const QUOTE_CHAR = new Char('"');
const OPEN_BRACKET_CHAR = new Char('[');
const CLOSE_BRACKET_CHAR = new Char(']');
const OPEN_CURLY_CHAR = new Char('{');
const CLOSE_CURLY_CHAR = new Char('}');
const COMMA_CHAR = new Char(',');

const ARRAY_OPEN = new Char(' [');
const OBJECT_OPEN = new Char(' {');
const MAP_PRINTED_OPEN = new Char('Map {');
const SET_PRINTED_OPEN = new Char('Set {');
const MAP_JOIN = new Char(' => ');
const OBJECT_JOIN = new Char(': ');

const DOWN_OP = { op: 'DOWN' };
const UP_OP = { op: 'UP' };
const NEWLINE_OP = { op: 'NEWLINE' };

class Stack {
  /*::
  length: number;
  items: Array<any>;
  */

  constructor() {
    this.length = 0;
    this.items = [];
  }

  push(value) {
    this.length = this.length + 1;
    this.items.push(value);
  }

  pop(value) {
    this.length = this.length - 1;
    return this.items.pop();
  }

  down() { this.push(DOWN_OP); }
  up() { this.push(UP_OP); }
  newLine() { this.push(NEWLINE_OP); }
}

class Refs {
  /*::
  layers: Array<Set<mixed>>;
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

function printSeries(context, series, stack, env, callback) {
  let length = series.length;

  if (length > 0) {
    stack.newLine();
    stack.up();

    for (let index = length - 1; index >= 0; index--) {
      let value = series[index];

      callback(value, index, length, context, stack, env);

      if (index > 0) {
        stack.newLine();
      }
    }

    stack.newLine();
    stack.down();
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
  printSeries(value, value, stack, env, printArrayLikeMember);
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

function filterSymbol(val) {
  let typeOf = typeof val;
  return typeOf !== 'symbol' && toString.call(val) !== '[object Symbol]';
}

function printObject(value, stack, env) {
  let keys = Object.keys(value).sort();
  let symbols = getSymbols(value);
  if (symbols.length) {
    keys = keys.filter(filterSymbol).concat(symbols);
  }
  stack.push(CLOSE_CURLY_CHAR);
  printSeries(value, keys, stack, env, printObjectMember);
  if (env.opts.min) {
    stack.push(OPEN_CURLY_CHAR);
  } else {
    stack.push(OBJECT_OPEN);
    stack.push(new Char(value.constructor ? value.constructor.name : 'Object'));
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
  printSeries(value, items, stack, env, printMapMember);
  stack.push(MAP_PRINTED_OPEN);
}

function printSetMember(value, index, length, context, stack, env) {
  printSeparator(COMMA_CHAR, index, length, stack, env);
  stack.push(value[1]);
}

function printSet(value, stack, env) {
  let items = Array.from(value.entries());
  stack.push(CLOSE_CURLY_CHAR);
  printSeries(value, items, stack, env, printSetMember);
  stack.push(SET_PRINTED_OPEN);
}

function printLiteralValue(value) {
  if (value === TRUE_VAL) return TRUE_PRINTED;
  if (value === FALSE_VAL) return FALSE_PRINTED;
  if (value === NULL_VAL) return NULL_PRINTED;
}

function printValue(value, stack, env, refs, depth) {
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

  if (value instanceof Error) return printError(value);

  return printObject(value, stack, env);
}

function printStack(value, env /*: Env */) {
  let result = '';
  let depth = 0;

  var stack = new Stack();
  var refs = new Refs();

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
        result = result + '\n' + createIndent(depth * env.opts.indent);
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
    throw new Error('pretty-format: Options "min" and "indent" cannot be used together.');
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

function prettyFormat(value /*: mixed */, opts /*: ?InitialOptions */) {
  let env = {
    opts: normalizeOptions(opts),
  };

  return printStack(value, env);
}

module.exports = prettyFormat;

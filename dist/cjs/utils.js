"use strict";
var Ember = require("ember")["default"] || require("ember");
var capitalize = require("ember/string").capitalize;
var camelize = require("ember/string").camelize;
var Promise = require("ember/rsvp").Promise;
var typeOf = require("ember").typeOf;
var get = require("ember").get;

function isThenable(thing) {
  var thingType = typeOf(thing);

  if (thingType === 'object' || thingType === 'instance') {
    return typeOf(get(thing, 'then')) === 'function';
  } else {
    return false;
  }
}

exports.isThenable = isThenable;// Takes a function, calls it, then wraps the result in a promise if it's not
// already a promise. If the function throws an error it is caught and called as
// the rejector of the created promise.
function withPromise(block) {
  var response;
  var exception;

  try {
    response = block();
  } catch(e) {
    exception = e;
  }

  if (isThenable(response)) {
    return response;
  } else {
    return new Promise(function(resolve, reject) {
      if (exception) {
        reject(exception);
      } else {
        resolve(response);
      }
    });
  }
}

exports.withPromise = withPromise;function capitalCamelize(str) {
  return capitalize(camelize(str));
}

exports.capitalCamelize = capitalCamelize;function toArray(thing) {
  return typeOf(thing) === 'array' ? thing : [thing];
}

exports.toArray = toArray;
define("ember-fsm/ember/fsm/machine",
  ["ember","./utils","./transition","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var Ember = __dependency1__.default;
    var required = __dependency1__.required;
    var computed = __dependency1__.computed;
    var typeOf = __dependency1__.typeOf;
    var inspect = __dependency1__.inspect;
    var capitalCamelize = __dependency2__.capitalCamelize;
    var Transition = __dependency3__["default"] || __dependency3__;

    var STATE_MACROS;
    var ALL_MACRO;
    var INITIAL_MACRO;

    STATE_MACROS = [
      ALL_MACRO     = '$all',
      INITIAL_MACRO = '$initial'
    ];

    __exports__["default"] = Ember.Object.extend({
      stateEvents:       required(),
      initialState:      'initialized',
      isTransitioning:   computed.bool('activeTransitions.length'),
      activeTransitions: null,
      currentState:      null,

      target: computed(function(key, value) {
        return arguments.length === 1 ? this : value;
      }),

      init: function() {
        this._transitions_ = {};
        this.set('activeTransitions', []);
        this._load_();
        this.set('currentState', this.get('initialState'));
        this._installBooleanStateAccessors_();
      },

      send: function(event) {
        var args = [].slice.call(arguments, 1, arguments.length);
        var fsm = this;
        var transition;
        var promise;
        var sameState;

        if (!this.get('eventNames').contains(event)) {
          throw new Ember.Error(
            'unknown state event ' + inspect(event) + ' try one of [' +
            this.get('eventNames').join(', ') + ']'
          );
        }

        transition = this.transitionFor(event, args);
        sameState  = transition.toState === this.get('currentState');

        if (this.get('isTransitioning') && !sameState) {
          throw new Ember.Error(
            'unable to transition out of ' + this.get('currentState') + ' state ' +
            'while transitions are active: ' +
            inspect(this.get('activeTransitions'))
          );
        }

        this.pushActiveTransition(transition);

        promise = transition.perform();

        promise.catch(function(error) {
          fsm.send('error', error);
        });

        promise.finally(function() {
          fsm.removeActiveTransition(transition);
        });

        return transition;
      },

      pushActiveTransition: function(transition) {
        this.get('activeTransitions').pushObject(transition);
      },

      removeActiveTransition: function(transition) {
        this.get('activeTransitions').removeObject(transition);
      },

      stateMapsFor: function(event) {
        var defs = this._transitions_[event];
        var maps = [];

        defs.forEach(function(def) {
          var map = {};
          var macro;
          var fromStates;

          if (macro = def.fromStatesMacro) {
            if (macro === ALL_MACRO) {
              fromStates = [this.get('initialState')];
            } else if (macro === INITIAL_MACRO) {
              fromStates = this.get('stateNames');
            } else {
              throw new Ember.Error('unknown state macro: ' + inspect(macro));
            }
          } else {
            fromStates = def.fromStates;
          }

          fromStates.forEach(function(fromState) {
            var copy = {};
            var key;

            for (key in def) {
              copy[key] = def[key];
            }

            copy.fromState = fromState;
            copy.event     = event;

            delete copy.fromStatesMacro;
            delete copy.fromStates;

            map[fromState] = copy;
          });

          maps.push(map);
        }, this);

        return maps;
      },

      checkGuard: function(guardProperty, inverse) {
        var target = this.get('target');
        var guardValue;
        var guardTarget;
        var result;

        if ((guardValue = this.get(guardProperty))) {
          guardTarget = this;
        } else if ((guardValue = target.get(guardProperty))) {
          guardTarget = target;
        } else {
          return inverse ? false : true;
        }

        if (typeOf(guardValue) === 'function') {
          result = guardValue.call(guardTarget, this) ? true : false;
        } else {
          result = guardValue;
        }

        return inverse ? !result : result;
      },

      transitionFor: function(event, args) {
        var currentState = this.get('currentState');
        var stateMaps    = this.stateMapsFor(event);
        var hadGuard     = false;
        var guardValue;
        var inverse;
        var params;
        var iterParams;
        var i;

        for (i = 0; i < stateMaps.length; i++) {
          iterParams = stateMaps[i][currentState];

          if (!iterParams) {
            continue;
          }

          if ((guardValue = iterParams['if'])) {
            inverse  = false;
            hadGuard = true;
          } else if ((guardValue = iterParams.unless)) {
            inverse  = true;
            hadGuard = true;
          }

          if (guardValue) {
            if (this.checkGuard(guardValue, inverse)) {
              params = iterParams;
              break;
            } else {
              continue;
            }
          }

          params = iterParams;
          break;
        }

        if (!params) {
          throw new Ember.Error('no ' + (hadGuard ? 'unguarded ' : '')  +
          'transition was defined for event ' + event + ' in state ' +
          currentState);
        }

        params.fsm       = this;
        params.eventArgs = args;

        return Transition.create(params);
      },

      inState: function(state) {
        var currentState = this.get('currentState');

        if (currentState === state) {
          return true;
        }

        if (currentState.slice(0, state.length) === state) {
          return true;
        }

        return false;
      },

      _setNewState_: function(transition) {
        this.set('currentState', transition.get('toState'));
      },

      _normalizeTransitionDefinition: function(params) {
        var defn      = {};
        var fromState = params.from;
        var toState   = params.to;

        if (!fromState || !toState) {
          throw new Ember.Error(
            'transition needs to specify both a from state and a to state: ' +
            Ember.inspect(params)
          );
        }

        if (STATE_MACROS.contains(fromState)) {
          defn.fromStatesMacro = fromState;
        } else if (typeOf(fromState) === 'array') {
          defn.fromStates = fromState;
        } else {
          defn.fromStates = [fromState];
        }

        defn.toState = toState;
        defn['if']   = params['if'];
        defn.unless  = params.unless;

        defn.userCallbacks = {
          beforeEvent:    params.before || params.beforeEvent,
          willExitState:  params.willExit || params.willExitState,
          willEnterState: params.willEnter || params.willEnterState,
          didExitState:   params.didExit || params.didExitState,
          didEnterState:  params.action || params.actions || params.didEnter || params.didEnterState,
          afterEvent:     params.after || params.afterEvent
        };

        return defn;
      },

      _normalizeTransitionPayload: function(payload) {
        var defs = [];
        var fromState;
        var toState;

        if (typeOf(payload) === 'array') {
          payload.forEach(function(params) {
            defs.push(this._normalizeTransitionDefinition(fsm, params));
          });
        } else if (typeOf(payload) === 'object') {
          for (fromState in payload) {
            toState = payload[fromState];
            defs.push(this._normalizeTransitionDefinition({
              from: fromState,
              to: toState
            }));
          }
        } else {
          throw new Ember.Error('transitions must be an object or an array');
        }

        return defs;
      },

      _load_: function() {
        var definition = this.get('stateEvents');
        var eventNames = [];
        var stateNames = [];
        var eventName;
        var eventPayload;
        var transPayload;
        var transDefs;
        var i;

        definition.error = { transitions: { $all: 'failed' } };

        for (eventName in definition) {
          eventPayload = definition[eventName];
          transPayload = (eventPayload.transitions || eventPayload.transition);
          transDefs    = this._normalizeTransitionPayload(transPayload);

          eventNames.push(eventName);
          this._transitions_[eventName] = transDefs;

          for (i = 0; i < transDefs.length; i++) {
            if (transDefs[i].fromStates) {
              stateNames.addObjects(transDefs[i].fromStates);
            }

            stateNames.addObject(transDefs[i].toState);
          }
        }

        this.set('stateNames', stateNames);
        this.set('eventNames', eventNames);
      },

      _installBooleanStateAccessors_: function() {
        var mixin  = {};
        var states = this.get('stateNames');
        var key;
        var accessorProperties = [];

        states.forEach(function(state) {
          var parts = state.split('.');

          if (parts.length > 1) {
            parts.forEach(function(part, index) {
              var substate;

              if (index === parts.length) {
                return;
              }

              substate = parts.slice(0, index).join('.');

              mixin['is' + capitalCamelize(substate)] = computed(function() {
                return this.inState(substate);
              }).property(state);
            });
          }

          mixin['is' + capitalCamelize(state)] = computed(function() {
            return this.inState(state);
          }).property('currentState');
        }, this);

        for (key in mixin) {
          accessorProperties.push(key);
        }

        this._booleanStateAccessors_ = accessorProperties;
        this.reopen(mixin);
      }
    });
  });define("ember-fsm/ember/fsm/stateful",
  ["ember","./machine","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var Mixin = __dependency1__.Mixin;
    var required = __dependency1__.required;
    var computed = __dependency1__.computed;
    var Machine = __dependency2__.Machine;

    __exports__["default"] = Mixin.create({
      initialState: undefined,
      stateEvents:  required(),
      isLoading:    computed.oneWay('fsm.isTransitioning'),
      currentState: computed.oneWay('fsm.currentState'),

      init: function() {
        var initialState;
        var params = {};
        var boolAccesorsMixin = {};

        params.stateEvents = this.get('stateEvents');
        params.target      = this;

        if ((initialState = this.get('initialState'))) {
          params.initialState = initialState;
        }

        this.set('fsm', Machine.create(params));

        this.get('fsm')._booleanStateAccessors_.forEach(function(accessor) {
          boolAccesorsMixin[accessor] = computed.oneWay('fsm.' + accessor);
        });

        this.reopen(boolAccesorsMixin);

        this._super();
      },

      sendStateEvent: function() {
        var fsm = this.get('fsm');
        return fsm.send.apply(fsm, arguments);
      }
    });
  });define("ember-fsm/ember/fsm/transition",
  ["ember","ember/rsvp","./utils","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var Ember = __dependency1__.default;
    var computed = __dependency1__.computed;
    var inspect = __dependency1__.inspect;
    var Promise = __dependency2__["default"] || __dependency2__;
    var hash = __dependency2__["default"] || __dependency2__;
    var withPromise = __dependency3__.withPromise;

    var CALLBACKS = [
      ['beforeEvent',    'event'],
      ['willExitState',  'fromState'],
      ['willEnterState', 'toState'],
      ['_setNewState_'],
      ['didExitState',   'fromState'],
      ['didEnterState',  'toState'],
      ['afterEvent',     'event']
    ];

    __exports__["default"] = Ember.Object.extend({
      fsm:           null,
      fromState:     null,
      toState:       null,
      event:         null,
      eventArgs:     null,
      userCallbacks: null,
      target:        computed.oneWay('fsm.target'),
      currentState:  computed.alias('fsm.currentState'),
      isResolving:   null,
      isResolved:    computed.not('isResolving'),
      isRejected:    null,

      init: function() {
        this.set('resolutions', {});
        this.set('rejections',  {});
      },

      perform: function() {
        var transition = this;
        var promise;

        promise = new Promise(function(resolve, reject) {
          var currentCallbackIndex = 0;

          function settleNext() {
            var cb = CALLBACKS[currentCallbackIndex++];

            if (!cb) {
              resolve(transition);
            } else {
              transition.callback(cb[0], cb[1]).then(settleNext, reject);
            }
          }

          settleNext();
        });

        this.set('isResolving', true);

        promise.catch(function() {
          transition.set('isRejected', true);
        });

        promise.finally(function() {
          transition.set('isResolving', false);
        });

        return promise;
      },

      userCallbacksFor: function(name) {
        var target    = this.get('target');
        var userValue = this.get('userCallbacks')[name];
        var callbacks = [];

        if (!userValue) {
          return [];
        }

        toArray(userValue).forEach(function(userDefinedName) {
          var userCallbacks = this.callbacksFor(userDefinedName);

          if (!userCallbacks.length) {
            throw new Ember.Error(
              'undefined callback ' + inspect(userDefinedName) + ' on ' +
              'target ' + inspect(target) + ' for transition:\n\n' +
              this
            );
          }

          userCallbacks.forEach(function(cb) {
            callbacks.push(cb);
          });
        }, this);

        return callbacks;
      },

      callbacksFor: function(name) {
        var callbacks = [];
        var fsm    = this.get('fsm');
        var target = this.get('target');
        var fn;

        if ((fn = fsm[name])) {
          callbacks.push([fsm, fn, 'fsm:' + name]);
        }

        if ((fn = target[name]) && fsm !== target) {
          callbacks.push([target, fn, name]);
        }

        return callbacks;
      },

      callback: function(name, arg0Property) {
        var arg0             = arg0Property ? this.get(arg0Property) : null;
        var promises         = {};
        var eventArgs        = this.get('eventArgs');
        var userCallbacks    = this.userCallbacksFor(name);
        var builtinCallbacks = this.callbacksFor(name);
        var transition       = this;
        var promise;

        function pushPromises(callbacks, argsTwerker) {
          var args = eventArgs.slice(0);

          argsTwerker(args);

          callbacks.forEach(function(cb) {
            var target = cb[0];
            var fn     = cb[1];

            promises[cb[2]] = withPromise(function() {
              return fn.apply(target, args);
            });
          });
        }

        pushPromises(builtinCallbacks, function(args) {
          args.insertAt(0, transition);

          if (arg0) {
            args.insertAt(0, arg0);
          }
        });

        pushPromises(userCallbacks, function(args) {
          if (arg0) {
            args.push(arg0);
          }

          args.push(transition);
        });

        promise = rsvpHash(promises);

        promise.then(function(results) {
          delete results._setNewState_;

          transition.get('resolutions')[name] = results;
        });

        promise.catch(function(error) {
          transition.get('rejections')[name] = error;
        });

        return promise;
      },

      toString: function() {
        return (
          'Transition {' +
          '  event:      ' + this.get('event') + ',\n' +
          '  eventArgs:  ' + inspect(this.get('eventArgs')) + ',\n' +
          '  fromState:  ' + inspect(this.get('fromState')) + ',\n' +
          '  toState:    ' + inspect(this.get('toState')) + ',\n' +
          '  isResolved: ' + this.get('isResolved') + ',\n' +
          '  isRejected: ' + this.get('isRejected') + '\n' +
          '}'
        );
      }
    });
  });define("ember-fsm/ember/fsm/utils",
  ["ember/string","ember/rsvp","ember","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var capitalize = __dependency1__.capitalize;
    var camelize = __dependency1__.camelize;
    var Promise = __dependency2__.Promise;
    var typeOf = __dependency3__.typeOf;

    function isThenable(thing) {
      return typeOf(thing) === 'object' && typeOf(thing.then) === 'function';
    }

    __exports__.isThenable = isThenable;// Takes a function, calls it, then wraps the result in a promise if it's not
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

    __exports__.withPromise = withPromise;function capitalCamelize(str) {
      return capitalize(camelize(str));
    }

    __exports__.capitalCamelize = capitalCamelize;function toArray(thing) {
      return typeOf(thing) === 'array' ? thing : [thing];
    }

    __exports__.toArray = toArray;
  });define("ember-fsm",
  ["./ember/fsm/machine","./ember/fsm/transition","./ember/fsm/stateful","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    /*!
    ember-fsm
    (c) 2014 Carsten Nielsen
    - License: https://github.com/heycarsten/ember-fsm/blob/master/LICENSE
    */

    var Machine = __dependency1__["default"] || __dependency1__;
    var Transition = __dependency2__["default"] || __dependency2__;
    var Stateful = __dependency3__["default"] || __dependency3__;

    __exports__.Machine = Machine;
    __exports__.Transition = Transition;
    __exports__.Stateful = Stateful;
  });
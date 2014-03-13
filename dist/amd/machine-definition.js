define(
  ["./utils","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var propertiesOf = __dependency1__.propertiesOf;
    var getFirst = __dependency1__.getFirst;
    var toArray = __dependency1__.toArray;

    __exports__["default"] = MachineDefinition;

    var ALL_MACRO      = '$all';
    var SAME_MACRO     = '$same';
    var INITIALIZED    = 'initialized';
    var TRANSITIONS    = ['transition', 'transitions'];
    var INITIAL_STATES = ['initialState'];
    var EXPLICITS      = ['explicitStates', 'knownStates'];
    var BEFORES        = ['before', 'beforeEvent'];
    var AFTERS         = ['after', 'afterEvent'];
    var WILL_ENTERS    = ['willEnter'];
    var DID_ENTERS     = ['didEnter'];
    var WILL_EXITS     = ['willExit'];
    var DID_EXITS      = ['didExit'];
    var DO_IFS         = ['doIf', 'runIf', 'guard'];
    var DO_UNLESSES    = ['doUnless', 'runUnless', 'unless'];
    var FROMS          = ['from', 'fromState', 'fromStates'];
    var TOS            = ['to', 'toState'];

    // normalized name, definition names, toArray
    var DEFMAP = {
      transition: [
        ['fromStates',  FROMS,       true],
        ['toState',     TOS,         false],
        ['beforeEvent', BEFORES,     true],
        ['afterEvent',  AFTERS,      true],
        ['willEnter',   WILL_ENTERS, true],
        ['didEnter',    DID_ENTERS,  true],
        ['willExit',    WILL_EXITS,  true],
        ['didExit',     DID_EXITS,   true],
        ['doIf',        DO_IFS,      false],
        ['doUnless',    DO_UNLESSES, false]
      ],

      event: [
        ['transitions', TRANSITIONS, true]
      ],

      states: [
        ['initialState',   INITIAL_STATES, false],
        ['explicitStates', EXPLICITS,      true]
      ],

      state: [
        ['willEnter', WILL_ENTERS, true],
        ['didEnter',  DID_ENTERS,  true],
        ['willExit',  WILL_EXITS,  true],
        ['didExit',   DID_EXITS,   true]
      ]
    };

    // Extracts definition keys and leaves behind "data", for example consider the
    // "states" node below:
    //
    // payload = {
    //   states: {
    //     initialState: 'ready',
    //     knownStates: 'ready',
    //
    //     ready: {
    //       willEnter: 'notifySomeone'
    //     }
    //   }
    // };
    //
    // definition = destructDefinition(payload.states, 'states');
    // definition => { initialState: 'ready', explicitStates: ['ready'] }
    // payload    => { ready: { willEnter: 'notifySomeone' } }
    function destructDefinition(payload, type) {
      var map = DEFMAP[type];
      var def = {};
      var property;
      var aliases;
      var makeArray;
      var value;
      var i;
      var j;

      if (!payload) {
        throw new TypeError('Expected payload object');
      }

      if (!map) {
        throw new TypeError('type is unknown: ' + type);
      }

      for (i = 0; i < map.length; i++) {
        property  = map[i][0];
        aliases   = map[i][1];
        makeArray = map[i][2];

        for (j = 0; j < aliases.length; j++) {
          value = payload[aliases[j]];
          payload[aliases[j]] = undefined;

          if (value !== undefined) {
            break;
          }
        }

        if (makeArray) {
          value = toArray(value);
        }

        def[property] = value;
      }

      return def;
    }

    function allocState(name, payload) {
      var state = {
        name: name,
        fromTransitions: [],
        toTransitions: [],
        willEnter: null,
        didEnter: null,
        willExit: null,
        didExit: null
      };

      updateState(state, payload);

      return state;
    }

    function updateState(state, payload) {
      var definition = destructDefinition(payload, 'state');
      var property;

      for (property in definition) {
        state[property] = definition[property];
      }

      return state;
    }

    function allocEvent(name, payload) {
      var event = {
        name: name,
        transitions: []
      };

      updateEvent(event, payload);

      return event;
    }

    function updateEvent(event, payload) {
      var definition  = destructDefinition(payload, 'event');
      var transitions = definition.transitions;
      var i;
      var transition;

      for (i = 0; i < transitions.length; i++) {
        event.transitions.push(allocEventTransition(event, transitions[i]));
      }

      return event;
    }

    function allocEventTransition(event, payload) {
      var def  = destructDefinition(payload, 'transition');
      var data = propertiesOf(payload);
      var fromToSpecifiedByName;
      var fromToSpecifiedByKVP;

      fromToSpecifiedByName = def.fromStates.length > 0 && def.toState;
      fromToSpecifiedByKVP  = data.length ? true : false;

      if (fromToSpecifiedByName && fromToSpecifiedByKVP) {
        throw new Error('You must specify transition states using either form: ' +
        '"state", to: "state" or fromState: "toState" not both');
      }

      if (!fromToSpecifiedByName && !fromToSpecifiedByKVP) {
        throw new Error('You must specify states to transition from and to in ' +
        'event transitions.');
      }

      if (fromToSpecifiedByKVP && data.length > 1) {
        throw new Error('You can only have one fromState: "toState" pair per ' +
        'transition. Consider using the from: ["states"], to: "state" form ' +
        'instead');
      }

      if (fromToSpecifiedByKVP) {
        def.fromStates = [data[0]];
        def.toState    = payload[data[0]];
      }

      def.event = event;

      return def;
    }

    function MachineDefinition(payload) {
      if (!(this instanceof MachineDefinition)) {
        throw new TypeError('please use the "new" operator to construct a ' +
        'MachineDefinition instance');
      }

      if (typeof payload !== 'object') {
        throw new TypeError('you must pass an object containing and "events" ' +
        'property as the sole argument to the Compiler constructor');
      }

      if (!payload.events) {
        throw new TypeError('"events" must be defined');
      }

      if (typeof payload.events !== 'object') {
        throw new TypeError('"events" must be an object');
      }

      if (payload.states && typeof payload.states !== 'object') {
        throw new TypeError('"states" must be an object');
      }

      this._payload      = payload;
      this._statesByName = {};
      this._eventsByName = {};
      this._stateConf    = {};

      if (payload.states) {
        this._stateConf = destructDefinition(payload.states, 'states');
      } else {
        this._stateConf = {};
      }

      this.isExplicit   = false;
      this.initialState = INITIALIZED || this._stateConf.initialState;
      this.states       = [];
      this.events       = [];
      this.transitions  = [];

      this._compile();
    }

    MachineDefinition.prototype = {
      lookupState: function(name) {
        return this._statesByName[name];
      },

      _compileStates: function() {
        this._allocateExplicitStates();
        this._applyStateDefinitions();
      },

      _allocateExplicitStates: function() {
        var states = this._stateConf.explicitStates;
        var i;
        var stateName;

        if (!states) {
          return;
        }

        this.isExplicit = true;

        for (i = 0; i < states.length; i++) {
          stateName = states[i];
          this._allocState(stateName);
        }
      },

      _applyStateDefinitions: function() {
        var payload = this._payload.states;
        var stateName;

        for (stateName in payload) {
          this._updateState(stateName, payload[stateName]);
        }
      },

      _allocState: function(name, def) {
        var state;

        if (this._lookupState(name)) {
          throw new Error('state ' + name + ' has already been allocated');
        }

        state = allocState(name, def);

        this.states.push(state);
        this._statesByName[name] = state;

        return state;
      },

      _updateState: function(name, payload) {
        var found;

        if ((found = this.lookupState(name))) {
          return updateState(found, payload);
        }

        if (this.isExplicit) {
          throw new Error('' + name + ' is not a defined state, add it to the ' +
          'list of known states');
        }

        return this._allocState(name, payload);
      },

      _compileEvents: function() {
        var payload = this._payload.events;
        var eventName;

        for (eventName in payload) {
          this._compileEvent(eventName, payload[eventName]);
        }
      },

      _compileEvent: function(name, payload) {
        var event = this._allocEvent(name, payload);

      },

      _allocEvent: function(name, payload) {
        var definition = allocEvent(name, payload)
        this.events.push(definition);
        this._eventsByName[name] = definition;
        return definition;
      },

      _runAfterCompile: function() {
        this.stateNames = ownPropertiesOf(this._statesByName);
      },

      _compile: function() {
        this._compileStates();
        this._compileEvents();
        this._unwindTransitions();
        this._runAfterCompile();
      }
    };
  });
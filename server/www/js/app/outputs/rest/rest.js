/**
 *
 * Send data through RESTful calls
 *
 * This plugin shall implement the following API
 *
 *  - wantOnly() : either an empty array, or string array of data types the plugin accepts
 *
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */


define(function(require) {
    
    "use strict";
    
    var _ = require('underscore'),
        Backbone = require('backbone');

    var Rest = function() {
        
        this.wantOnly = function() {
            return [];
        }
        
        this.outputFields = function() {
            return { "field1": { "name": "Field 1", "required": true },
                     "field2"     : { "name": "Field 2", "required": false},
                     "field3" : { "name": "Field 3", "required": false },
                   }
        }

        
    };

    _.extend(Rest.prototype, Backbone.Events);
    
    return Rest;

});
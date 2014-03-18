/**
 * A Fluke 287/289 series instrument. This
 * object implements a standard API shared by all instrument
 * objects:
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 */

define(function(require) {
    "use strict";
    
    var linkmanager = require('app/instruments/fluke289/linkmanager');

    return function() {

        // Helper function: get driver capabilites.
        // returns a simple array of capabilities    
        this.getCaps = function() {
            return ["LiveDisplay", "LogManagementView", "NumDisplay", "DiagDisplay", "LogView"];
        };

        // This has to be a backbone view
        this.getSettings = function(arg, callback) {
            require(['app/instruments/fluke289/settings'], function(view) {
                callback(new view(arg));
            });
        };

        // This has to be a Backbone view
        this.getLiveDisplay = function(arg, callback) {
            require(['app/instruments/fluke289/display_live'], function(view) {
                callback(new view(arg));
            });
        };

            // This is a Backbone view
        // This is a numeric display
        this.getNumDisplay = function(arg, callback) {
            require(['app/instruments/fluke289/display_numeric'], function(view) {
                callback(new view(arg));
            });
        };

        // A diagnostics/device setup screen
        this.getDiagDisplay = function(arg, callback) {
            require(['app/instruments/fluke289/display_diag'], function(view) {
                callback(new view(arg));
            });
        };

        // This has to be a link manager
        this.getLinkManager = function(arg, callback) {
            return new linkmanager(arg);
        };

        // Return a Backbone view which is a mini graph
        this.getMiniLogview = function(arg, callback) {
            return null;
        };

        // Return a device log management view
        this.getLogManagementView = function(arg, callback) {
            require(['app/instruments/fluke289/display_logmanager'], function(view) {
                callback(new view(arg));
            });
        }

        // Render a log (or list of logs) for the device.
        this.getLogView = function(arg, callback) {
            require(['app/instruments/fluke289/display_log'], function(view) {
                callback(new view(arg));
            });
        }


    };
});
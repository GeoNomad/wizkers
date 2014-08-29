/**
 * The module that manages recording the output of an instrument to the
 * database
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

var mongoose = require('mongoose');
var _ = require("underscore")._;

var Output = mongoose.model('Output');


var Safecast = require('./safecast.js');
// var Rest     = require('./rest.js');

module.exports = {
    
    activeOutputs: [],
    availableOutputs: { "safecast": Safecast },
    
    // Selects the active output plugins. Note that we only require
    // the instrument ID, since it stores its own list of enabled outputs,
    // and more importantly, all the settings for those.
    enableOutputs: function(id) {
        var self = this;
        console.log('Retrieving Outputs for Instrument ID: ' + id);
        
        // TODO: nicely disable previously active outputs ?
        this.activeOutputs = [];
        
        Output.find({ instrumentid: id, enabled: true} , function(err,outputs) {
            _.each(outputs, function(output) {
                console.log(output);
                // Now we need to configure the output and put it into our activeOutputs list
                var pluginType = self.availableOutputs[output.type];
                if (pluginType == undefined) {
                    console.log("***** WARNING ***** we were asked to enable an output plugin that is not supported but this server");
                } else {
                    var plugin = new pluginType();
                    // The plugin needs its metadata and the mapping for the data,
                    // the output manager will take care of the alarms/regular output
                    plugin.setup(output.metadata, output.mappings);
                    self.activeOutputs.push( { "plugin": plugin, "config": output } );
                }
            });
        });


    },

    // Main feature of our manager: send the data
    // to all active output plugins according to their
    // schedule.
    output: function(data) {
        console.log("*** STUB: send data to output plugins ***");
        
    }
    
};
    



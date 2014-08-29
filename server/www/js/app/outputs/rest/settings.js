/**
 *
 * Send data to another system through a RESTful call
 *
 * This file manages the settings view for settings that are
 * specific to this output, and that are stored in the output's
 * metadata
 *
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */


define(function(require) {
    
    "use strict";
    
    var _ = require('underscore'),
        Backbone = require('backbone');
        
    var  template = require('tpl/outputs/RestSettingsView');
    
    return Backbone.View.extend({
            initialize:function () {
                // Metadata is a simple object looking like this:
                // {  'address': 'name', 'address2': 'name2', etc... }
                this.mappings = this.model.get('metadata');
                if (this.mappings == null) {
                    this.mappings = {};
                    this.model.set('metadata', this.mappings);
                }
            },

            render:function () {
                $(this.el).html(template({mappings: this.mappings}));
                return this;
            },
    
            events: {
                "change" : "change"
            },
    
            change: function(event) {
                console.log("Rest output bespoke settings change");

                // Apply the change to the metadata
                var target = event.target;        
                this.mappings[target.name] = target.value;
                this.model.set('metadata',this.mappings);

                // This view is embedded into another view, so change events
                // are going to bubble up to the upper view and change attributes
                // with the same name, so we stop event propagation here:
                event.stopPropagation();

            },
    });
});
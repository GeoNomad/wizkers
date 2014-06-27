/*
 * Log management.
 *
 * Our model is the settings object.
 *
 * This is a generic view, all devices display this.
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

define(function(require) {
    
    "use strict";
    
    var $       = require('jquery'),
        _       = require('underscore'),
        Backbone = require('backbone'),
        tpl     = require('text!tpl/LogManagementView.html'),
        template = null;
        
        try {
            template = _.template(tpl);
        } catch (e) {
            // Will happen if we are packaged in a Chrome app
            template = require('js/tpl/LogManagementView.js');
        }

    return Backbone.View.extend({

        initialize:function () {

            this.deviceLogs = this.collection;
            this.selectedLogs = [];        
        },

        events: {
            "click a": "handleaclicks",
            "change .logcheckbox": "refreshLogList",
            "click .displaylog": "displayLog",
            "click .delete_log": "deleteLog",
            "click #do-delete": "doDeleteLog",
        },

        /* Nice way to disable an anchor button when it is disabled */
        handleaclicks: function(event) {
            if ($(event.currentTarget).attr('disabled'))
                event.preventDefault();
        },


        // Called when a checkbox is clicked
        refreshLogList: function() {
            var list = $('.logcheckbox',this.el);
            // Create a list of all checked entry IDs
            var entries=[];
            _.each(list, function(entry) {
                if (entry.checked)
                    entries.push(entry.value);
            });
            this.selectedLogs = entries;
            this.render();
        },

        displayLog: function() {
            if ($('.displaylog', this.el).attr('disabled'))
                return false;
            router.navigate('displaylogs/' + settings.get('currentInstrument') + '/' + this.selectedLogs.join(','),true);
            return false;
        },

        deleteLog: function(event) {
            var data = $(event.currentTarget).data();
            $('#do-delete', this.el).data('id',data.id);
            $('#deleteConfirm',this.el).modal('show');

        },

        doDeleteLog: function(event) {
            var self = this;
            var logToDelete = this.deviceLogs.where({_id: $(event.currentTarget).data('id')});
            var logEntries = logToDelete[0].entries;
            
            // Unfortunately, we need to fetch the entries to populate the array, before
            // deleting it - I have not found a way around this...
            logEntries.fetch({
                success: function() {
                    // Note: CANNOT use a "each" for logEntries because we
                    // are doing destroys which modifies the array as we go along,
                    // so we are using this recursive async method:
                    var doit = function() {
                        var entry = logEntries.at(0);
                        if (entry) {
                            console.log("Destroying entry...");
                            entry.destroy({ success: function() {
                                                console.log("Entry deleted");
                                                doit();                
                                                            },
                                                            error: function(model, err) { 
                                                                console.log(err);
                                                            }
                                                          });
                        } else {
                            // No entries anymore, delete the log
                            logToDelete[0].destroy(
                                {success: function(model, response) {
                                    $('#deleteConfirm',self.el).modal('hide');
                                    self.render();
                                    }
                                });
                        }
                    }
                    doit();
                }});
        },

        render:function () {
            var self = this;
            console.log('Main render of Log management view');
            
            $(this.el).html(template({ deviceLogs: this.collection.toJSON(), selected: this.selectedLogs,
                                      instrumentid: instrumentManager.getInstrument().id}));

            // Depending on device capabilities, enable/disable "device logs" button
            if (instrumentManager.getCaps().indexOf("LogManagementView") == -1 || ! linkManager.isConnected()) {
                    $('.devicelogs',self.el).attr('disabled', true);
            }
            
            // Now, we only want to scroll the table, not the whole page:
            var tbheight = window.innerHeight - $('#id1',this.el).height() - $('.header .container').height() - 20;
            $('#tablewrapper',this.el).css('max-height',
                                       tbheight + 'px'
                                            );
            
            return this;
        },

        onClose: function() {
            console.log("Log management view closing...");

            // Restore the settings since we don't want them to be saved when changed from
            // the home screen
            settings.fetch();
        },

    });
});
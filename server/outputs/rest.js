/**
 * A REST HTTP Calls output plugin
 *
 * (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 */

var mongoose = require('mongoose'),
    querystring = require('querystring'),
    utils = require('../utils.js'),
    http = require('http');


module.exports = function rest() {
    
    var mappings = null;
    var settings = null;
    var post_options = {};
    var regexpath = "";
    var regexargs = "";
    var output_ref = null;

    var matchTempl = function(str, args) {
        return str.replace(/<%=(.*?)%>/g, function(match, field) {
            return args[field] || match;
        });
    }

    var decompUrl = function(str) {
        if (str == undefined)
            return false;
        // Straight from RFC 3986 Appendix B
        var decomp = str.match(/(([^:/?#]+):\/\/([^/?#]*))?(([^?#]*)(\?([^#]*))?(#(.*))?)/);
        return {
            proto: decomp[2],
            host: decomp[3],
            path: decomp[5],
            args: decomp[7],
            ref: decomp[9]
        }
    }
    
    // Load the settings for this plugin
    this.setup = function(output) {
        
        console.log("[REST Output plugin] Setup a new instance");
        mappings = output.maping;
        settings = output.metadata;
        output_ref = output;
        
        // Prepare the post options:
        post_options = {
            host: decompUrl(settings.resturl).host,
            port: 80,
            method: (settings.httprequest == "get") ? 'GET':'POST',
            // we don't set path here because it is templated
            headers: {
                'X-Datalogger': 'wizkers.io REST plugin'
            }
        };
        if (settings.httprequest == "post")
            post_options['headers']['Content-Type'] = 'application/x-www-form-urlencoded';

        regexpath = decompUrl(settings.resturl).path;
        regexargs = decompUrl(settings.resturl).args;
        
    };
    
    var resolveMapping = function(key,data) {
        var m = mappings[key];
        if (typeof m == 'undefined')
            return undefined;
        // Static mappings start with "__"
        if (m.indexOf("__")==0)
            return m.substr(2);
        return utils.JSONflatten(data)[mappings[key]];
    };

    
    
    this.sendData = function(data) {
        var self = this;
        console.log("[REST Output plugin] Send data");

        // Step one: prepare the structure
        var fields = {};
        for (var mapping in mappings) {
            fields[mapping] = self.resolveMapping(mapping, data);
        };

        post_options.path = matchTempl(regexpath, fields);
        var post_data = matchTempl(regexargs, fields);

        // If we do a GET, aggregate the path and post_data
        if (post_options.method == "GET") {
            post_options.path = post_options.path + '?' + post_data;
        }

        output_ref.save({'last': new Date().getTime()});
        var post_request = http.request(post_options, function(res) {
            var err = true;
            console.log("[REST Output Plugin] REST Request result");
            // this is the xmlhttprequest
            switch (this.status) {
                    case 0:  // Cannot connect
                        output_ref.set('lastmessage', 'Cannot connect to host');
                        break;
                    case 200:
                    case 201: // success
                        output_ref.set('lastsuccess', res.timeStamp);
                        output_ref.set('lastmessage', this.statusText);
                        err = false;
                        break;
                    default:
                        output_ref.set('lastmessage', this.statusText);
                        break;
            }
            // self.trigger('outputTriggered', { 'name': 'rest', 'error': err, 'message': this.statusText } );
            output_ref.save();
        });
        if (post_options.method == 'POST') {
            post_request.write(post_data);
        }
        post_request.end();
    };
    

        
};
    



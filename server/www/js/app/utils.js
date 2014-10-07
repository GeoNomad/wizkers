/**
 *  Various useful utility functions.
 *
 * Original code (c) 2014 Edouard Lafargue, ed@lafargue.name
 * All rights reserved.
 *
 * Some parts of this code come from Christophe Coenraets, license unclear ? TODO
 */

define(function(require) {
    
    "use strict";
    
    return {
        
        // Returns an array with unique elements from an array
        // that can contain multiple elements, see
        // http://www.shamasis.net/2009/09/fast-algorithm-to-find-unique-items-in-javascript-array/
        // and multiple stackoverflow references:
        unique: function(arr) {
            if (arr == null)
                return [];
            var o = {}, i, l = arr.length, r = [];
            for(i=0; i<l;i+=1) o[arr[i]] = arr[i];
            for(i in o) r.push(o[i]);
        return r;
        },
        
        displayValidationErrors: function (messages) {
            for (var key in messages) {
                if (messages.hasOwnProperty(key)) {
                    this.addValidationError(key, messages[key]);
                }
            }
            this.showAlert('Warning!', 'Fix validation errors and try again', 'alert-warning');
        },

        addValidationError: function (field, message) {
            var controlGroup = $('#' + field).parent().parent();
            controlGroup.addClass('error');
            $('.help-inline', controlGroup).html(message);
        },

        removeValidationError: function (field) {
            var controlGroup = $('#' + field).parent().parent();
            controlGroup.removeClass('error');
            $('.help-inline', controlGroup).html('');
        },

        showAlert: function(title, text, klass) {
            $('.alert').removeClass("alert-error alert-warning alert-success alert-info");
            $('.alert').addClass(klass);
            $('.alert').html('<strong>' + title + '</strong> ' + text);
            $('.alert').show();
        },

        hideAlert: function() {
            $('.alert').hide();
        },

        uploadFile: function(path, file, callbackSuccess) {
            var self = this;
            var data = new FormData();
            data.append('file', file);
            $.ajax({
                url: path,
                type: 'POST',
                data: data,
                processData: false,
                cache: false,
                contentType: false
            })
            .done(function (val) {
                console.log(file.name + " uploaded successfully");
                callbackSuccess(val);
            })
            .fail(function () {
                self.showAlert('Error!', 'An error occurred while uploading ' + file.name, 'alert-error');
            });
        },

        hms: function(seconds) {
            var   h = parseInt(seconds/3600,10)
                , m = parseInt(seconds/60,10)- h*60
                , s = Math.floor(seconds%60);
            return [h,m,s]
                .join(':')
                .replace(/\b\d\b/g,
                         function(a){ 
                            return Number(a)===0 ? '00' : a<10? '0'+a : a; 
                         }
                        );
        },
        
        
        // See http://stackoverflow.com/questions/19098797/fastest-way-to-flatten-un-flatten-nested-json-objects
        JSONflatten : function(data) {
            var result = {};
            function recurse (cur, prop) {
                if (Object(cur) !== cur) {
                    result[prop] = cur;
                } else if (Array.isArray(cur)) {
                     for(var i=0, l=cur.length; i<l; i++)
                         recurse(cur[i], prop + "[" + i + "]");
                    if (l == 0)
                        result[prop] = [];
                } else {
                    var isEmpty = true;
                    for (var p in cur) {
                        isEmpty = false;
                        recurse(cur[p], prop ? prop+"."+p : p);
                    }
                    if (isEmpty && prop)
                        result[prop] = {};
                }
            }
            recurse(data, "");
            return result;
        },
        
        JSONunflatten : function(data) {
            "use strict";
            if (Object(data) !== data || Array.isArray(data))
                return data;
            var regex = /\.?([^.\[\]]+)|\[(\d+)\]/g,
                resultholder = {};
            for (var p in data) {
                var cur = resultholder,
                    prop = "",
                    m;
                while (m = regex.exec(p)) {
                    cur = cur[prop] || (cur[prop] = (m[2] ? [] : {}));
                    prop = m[2] || m[1];
                }
                cur[prop] = data[p];
            }
            return resultholder[""] || resultholder;
        }
        
    };
});
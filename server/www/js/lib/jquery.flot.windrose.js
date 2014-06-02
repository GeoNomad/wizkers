/*
 * The MIT License

Copyright (c) 2012, 2013 by Juergen Marsch

Customisation (c) 2014 by Edouard Lafargue, ed@lafargue.name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

(function ($) {
    "use strict";
    var pluginName = "windrose", pluginVersion = "0.1";
    var options = {
        series: { 
            rose: {
                active: false,
                show: false,
                autoscale: true,
                roseSize: 0.7,
                leafSize: 0.7,
                dataMin: 0,
                dataMax: 100,
                drawGrid: {drawValue:true, drawLabel: true, labelPos:0.5, gridMode: "data"},
                highlight: { opacity: 0.5 }
            }
        }
    };
    var replaceOptions = { grid:{ show:false} };
    var defaultOptions = {
        series:{        
            nearBy:{distance: 6,
                findItem: null,
                findMode: "circle",
                drawEdit: null,
                drawHover: null
            }
        },
        grid:{ ranges:5, font:"12px HelveticaNeue-Light", valuefont: "6px HelveticaNeue-Light"}

    };
    function init(plot) {
        var offset = null,opt = null,series = null,lctx,data;
        var maxRadius,centerLeft,centerTop,leafAngle,offsetAngle,colors;
        plot.hooks.processOptions.push(processOptions);
        plot.hooks.processRawData.push(processRawData);
        function processOptions(plot,options){
            if(options.series.rose.active===true){
                $.extend(true,options,replaceOptions);
                $.plot.JUMlib.data.extendEmpty(options,defaultOptions);
                opt = options;
                plot.hooks.drawSeries.push(drawSeries);
                plot.hooks.draw.push(draw);
                plot.hooks.drawBackground.push(autoScale);
            }
        }
        
        // This function goes through our series to find the highest value,
        // then rounds the scale to the upper 5%
        function autoScale(plot, canvascontext) {
            if (!opt.series.rose.autoscale)
                return;
            var maxval = 0;
            var data = plot.getData();
            for (var j = 0; j < data.length; j++) {
                if (data[j].rose.pointer)
                    continue;
                for (var i = 0; i < data[j].data.length; i++) {
                    if (data[j].data[i] > maxval) maxval = data[j].data[i];
                }
            }
            maxval = 5 + 5*Math.round(maxval/5);
            if (maxval>100 ) maxval = 100;
            
            opt.series.rose.dataMax = maxval;
        }
        function processRawData(plot,series,data,datapoints){
            if(series.rose.show === true){
                var canvas = plot.getCanvas();
                maxRadius =  Math.min(canvas.width,canvas.height)/2 * opt.series.rose.roseSize;
                centerTop = (canvas.height/2);
                centerLeft = (canvas.width/2);
                colors = createColors(opt,series.data[0].length);
                series.nearBy.findItem = findNearbyItemRose;
                series.nearBy.drawHover = drawHoverRose;
                offset = plot.getPlotOffset();
                switch(opt.series.rose.drawGrid.gridMode){
                    case "data":
                        leafAngle = 360 / series.data.length; break;
                    case "ticks":
                        leafAngle = 360 / opt.grid.tickLabel.length; break;
                }
                offsetAngle = leafAngle * (1 - opt.series.rose.leafSize) / 2;    
            }
        }
        function drawSeries(plot, ctx, serie){
            var angle,angleStart,angleEnd,radius,color,colorData,dt;
            if (serie.rose.show) {
                if (serie.rose.pointer) {
                    // If a data series contains a "pointer" attribute which is true,
                    // then we expect data to be an angle to draw the data
                    angle = -90 + serie.data[0];
                    // New: draw a pointer with the last value of the data
                    ctx.beginPath();
                    var ptx = centerLeft + Math.round(Math.cos(Math.PI*2*angle/360) * maxRadius* 94/100),
                        pty = centerTop + Math.round(Math.sin(Math.PI*2*angle/360) * maxRadius * 94/100),
                        side = maxRadius * 6 / 100; // size of the triangle
                    color = getColor(serie.color);
                    ctx.fillStyle = color;
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    ctx.lineTo(ptx,pty);
                    ctx.lineTo(ptx+Math.round(Math.cos(Math.PI*2*(angle+45)/360)*side),
                                pty+Math.round(Math.sin(Math.PI*2*(angle+45)/360)*side));
                    ctx.lineTo(ptx+Math.round(Math.cos(Math.PI*2*(angle-45)/360)*side),
                                pty+Math.round(Math.sin(Math.PI*2*(angle-45)/360)*side));
                    ctx.lineTo(ptx,pty);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    series = serie;
                    angle = -90 - offsetAngle*2;
                    for(var j = 0; j < serie.data.length; j++){
                        dt = serie.data[j];
                        angleStart =  angle + offsetAngle;
                        angleEnd =  angle + leafAngle - offsetAngle;
                        angle += leafAngle;
                        if(dt.length){
                            radius = getPieRadius(dt[0]);
                            colorData = { ctx:ctx,serie:serie,serieIndex:j,colors:colors,radius:radius,left:centerLeft,top:centerTop};
                            color = getColor(colorData);
                            drawPie(ctx,dt[1],dt[2],radius,color);
                        }
                        else
                        {
                            radius = getPieRadius(dt);
                            colorData = { ctx:ctx,serie:serie,serieIndex:j,colors:colors,radius:radius,left:centerLeft,top:centerTop};
                            color = getColor(colorData);
                            drawPie(ctx,angleStart,angleEnd,radius,color);
                        }
                    }
                }
            }
        }
        function drawPie(ctx,angleStart,angleEnd,radius,color){
            var s = 2 * Math.PI * angleStart / 360,
                t = 2 * Math.PI * angleEnd / 360,          
                x = centerLeft + Math.round(Math.cos(s) * radius),
                y = centerTop + Math.round(Math.sin(s) * radius);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(centerLeft,centerTop);
            ctx.lineTo(x,y);
            ctx.arc(centerLeft,centerTop,radius,s,t);
            ctx.lineTo(centerLeft,centerTop);
            ctx.closePath();
            ctx.fill();      
        }
        function getPieRadius(data){
            return (data - opt.series.rose.dataMin) / (opt.series.rose.dataMax - opt.series.rose.dataMin) * maxRadius;
        }
        function draw(plot,ctx){
            var angle = -90-offsetAngle*2 ,i;
            lctx = ctx;
            data = plot.getData();
            ctx.strokeStyle = opt.grid.tickColor;
            ctx.fillStyle = opt.grid.color;
            for(i = 1; i <= opt.grid.ranges; i++){
                drawGridRange(ctx,i);
                if(opt.series.rose.drawGrid.drawValue === true){ drawGridValue(ctx,i);}
            }
            for(i = 0; i < opt.grid.tickLabel.length; i++){
                drawGridLine(ctx,angle);
                drawGridLabel(ctx,angle + leafAngle * series.rose.drawGrid.labelPos,opt.grid.tickLabel[i]);
                angle += leafAngle;
            }
            function drawGridRange(ctx,i){
                var radius;
                ctx.beginPath();
                radius = maxRadius / opt.grid.ranges * i;
                ctx.arc(centerLeft,centerTop,radius,0,Math.PI * 2);
                ctx.closePath();
                ctx.stroke();
            }
            function drawGridValue(ctx,i){
                var t = opt.series.rose.dataMin + (opt.series.rose.dataMax - opt.series.rose.dataMin) / opt.grid.ranges * i;
                ctx.font = opt.grid.valuefont;
                ctx.fillText(t,centerLeft + maxRadius / opt.grid.ranges * i + 2 ,centerTop + 2 );
            }
            function drawGridLine(ctx,angle){
                var s = 2 * Math.PI * angle / 360,
                    x = centerLeft + Math.round(Math.cos(s) * maxRadius),
                    y = centerTop + Math.round(Math.sin(s) * maxRadius);
                ctx.beginPath();
                ctx.moveTo(centerLeft,centerTop);
                ctx.lineTo(x,y);
                ctx.closePath();
                ctx.stroke();
            }
            function drawGridLabel(ctx,angle,label){
                ctx.font = opt.grid.font;
                var s = 2 * Math.PI * angle / 360,
                    metrics = ctx.measureText(label),
                    x = centerLeft - metrics.width/2 + Math.round(Math.cos(s) * maxRadius * 1.2),
                    y = centerTop + 6 + Math.round(Math.sin(s) * maxRadius * 1.2);
                // if(between(angle,-90,0) || between(angle,180,270)) { y -= 5; }
                // if(between(angle,0, 180)) { y += 15; }
                // if(between(angle,90,270)) { x -= metrics.width; }
                ctx.fillText(label,x,y);
            }
        }
        function findNearbyItemRose(mouseX,mouseY,i,serie){
            return findNearby(mouseX,mouseY,i,serie);
            function findNearby(mouseX,mouseY,i,serie){
                var item = null,angle,radius,j,k,r;
                angle = 0;
                for(j = 0; j < serie.data.length; j++){
                    r = findItem(angle,maxRadius);
                    if( r === true){
                        item = [i,j];
                        for(k = 0; k < data.length; k++){
                            radius = getPieRadius(data[k].data[j]);
                            r = findItem(angle,radius);
                            if(r === true){ item = [k,j]; }
                        }
                        return item;
                    } 
                    angle += leafAngle;            
                }
                function findItem(angle,radius){
                    var r,s,t,x,y;
                    lctx.save();
                    lctx.beginPath();
                    s = 2 * Math.PI * angle / 360;
                    t = 2 * Math.PI * (angle + leafAngle) / 360;          
                    x = centerLeft + Math.round(Math.cos(s) * radius);
                    y = centerTop + Math.round(Math.sin(s) * radius);
                    lctx.moveTo(centerLeft,centerTop);
                    lctx.lineTo(x,y);
                    lctx.arc(centerLeft,centerTop,radius,s,t);
                    lctx.closePath();
                    r = lctx.isPointInPath(mouseX, mouseY);
                    lctx.restore();
                    return r;
                }
                return item;	        
            }
        }
        function drawHoverRose(octx,serie,dataIndex){
            var angle = dataIndex * leafAngle;
            var c = "rgba(255,255,255," + serie.rose.highlight.opacity + ")";
            drawPie(octx,angle,angle + leafAngle,maxRadius,c);
        }
    }
    var between = $.plot.JUMlib.library.between;
    var createColors = $.plot.JUMlib.data.createColors;
    var getColor = $.plot.JUMlib.data.getColor;
    $.plot.plugins.push({
        init: init,
        options: options,
        name: pluginName,
        version: pluginVersion
    });
})(jQuery);
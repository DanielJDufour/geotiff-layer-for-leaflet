"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var chroma = require("chroma-js");

var L = window.L;

module.exports = L.GridLayer.extend({

    initialize: function initialize(options) {
        try {
            console.log("starting GeoTIFFLayer.initialize with", options);

            if (!options.keepBuffer) options.keepBuffer = 25;

            if (!options.resolution) options.resolution = Math.pow(2, 5);

            if (options.updateWhenZooming === undefined) options.updateWhenZooming = false;

            var geotiff = options.geotiff;

            this.scale = chroma.scale();

            var image = geotiff.getImage();
            this._image = image;

            var no_data_value = parseFloat(image.fileDirectory.GDAL_NODATA);
            this.no_data_value = no_data_value;

            console.log("starting readRaster");
            var rasters = image.readRasters();
            console.log("finished readRasters");
            this.rasters = rasters;

            var number_of_rasters = rasters.length;

            this.maxs = [];
            this.mins = [];
            this.ranges = [];

            var max = void 0;var min = void 0;
            console.log("starting to get min, max and ranges");
            for (var r = 0; r < number_of_rasters; r++) {

                var values = rasters[r];
                var number_of_values = values.length;

                for (var v = 1; v < number_of_values; v++) {
                    var value = values[v];
                    if (value != no_data_value) {
                        if (min === undefined || value < min) min = value;else if (max === undefined || value > max) max = value;
                    }
                }
                this.maxs.push(max);
                this.mins.push(min);
                this.ranges.push(max - min);
            }
            console.log("maxs:", this.maxs);
            console.log("mins:", this.mins);
            console.log("ranges:", this.ranges);

            var fileDirectory = image.fileDirectory;

            // https://www.awaresystems.be/imaging/tiff/tifftags/modeltiepointtag.html

            var _fileDirectory$ModelT = _slicedToArray(fileDirectory.ModelTiepoint, 6),
                i = _fileDirectory$ModelT[0],
                j = _fileDirectory$ModelT[1],
                k = _fileDirectory$ModelT[2],
                x = _fileDirectory$ModelT[3],
                y = _fileDirectory$ModelT[4],
                z = _fileDirectory$ModelT[5];

            // https://www.awaresystems.be/imaging/tiff/tifftags/modelpixelscaletag.html


            var _fileDirectory$ModelP = _slicedToArray(fileDirectory.ModelPixelScale, 3),
                ScaleX = _fileDirectory$ModelP[0],
                ScaleY = _fileDirectory$ModelP[1],
                ScaleZ = _fileDirectory$ModelP[2];

            // caching for use in createTile


            this._ScaleX = ScaleX;
            this._ScaleY = ScaleY;

            var xmin = x;
            this._xmin = xmin; //caching for later, used by createTile
            var ymax = y;
            this._ymax = ymax;

            var w = image.getWidth();
            this.tiff_width = w;

            var h = image.getHeight();
            this.tiff_height = h;

            var xmax = xmin + w * ScaleX;
            this._xmax = xmax;
            var ymin = ymax - h * ScaleY;
            this._ymin = ymin;

            var southWest = L.latLng(ymin, xmin);
            var northEast = L.latLng(ymax, xmax);

            var bounds = L.latLngBounds(southWest, northEast);

            this._bounds = bounds;
            options.bounds = bounds;

            L.setOptions(this, options);
        } catch (error) {
            console.error("ERROR initializing GeoTIFFLayer", error);
        }
    },

    createTile: function createTile(coords) {
        var _this = this;

        var debug_level = 0;

        if (debug_level >= 1) {
            var start_time = performance.now();
            var duration_reading_rasters = 0;
            var time_started_reading_rasters;
            var time_started_filling_rect;
            var duration_filling_rects = 0;
        }

        //if (debug_level >= 1) console.group();

        //if (debug_level >= 1) console.log("starting createTile with coords:", coords);

        var no_data_value = this.no_data_value;
        var scale = this.scale;
        var mins = this.mins;
        var ranges = this.ranges;
        var rasters = this.rasters;

        // create a <canvas> element for drawing
        var tile = L.DomUtil.create('canvas', 'leaflet-tile');

        //tile.style.border = "5px solid pink";

        // get a canvas context and draw something on it using coords.x, coords.y and coords.z
        var context = tile.getContext('2d');

        var tileSize = this.getTileSize();
        var tile_height = tile.height = tileSize.y;
        var tile_width = tile.width = tileSize.x;

        var bounds = this._tileCoordsToBounds(coords);
        //if (debug_level >= 1) console.log("bounds:", bounds);

        var xmin_of_tile = bounds.getWest();
        var xmax_of_tile = bounds.getEast();
        var ymin_of_tile = bounds.getSouth();
        var ymax_of_tile = bounds.getNorth();
        //if (debug_level >= 1) console.log("ymax_of_tile:", ymax_of_tile);

        var resolution = this.options.resolution;

        var number_of_rectangles_across = resolution;
        var number_of_rectangles_down = resolution;

        var height_of_rectangle_in_pixels = tile_height / number_of_rectangles_down;
        //if (debug_level >= 1) console.log("height_of_rectangle_in_pixels:", height_of_rectangle_in_pixels);
        var width_of_rectangle_in_pixels = tile_width / number_of_rectangles_across;
        //if (debug_level >= 1) console.log("width_of_rectangle:", width_of_rectangle_in_pixels);

        var height_of_rectangle_in_degrees = (ymax_of_tile - ymin_of_tile) / number_of_rectangles_down;
        //if (debug_level >= 1) console.log("height_of_rectangle_in_degrees:", height_of_rectangle_in_degrees);
        var width_of_rectangle_in_degrees = (xmax_of_tile - xmin_of_tile) / number_of_rectangles_across;
        //if (debug_level >= 1) console.log("width_of_rectangle_in_degrees:", width_of_rectangle_in_degrees);

        var xmin = this._xmin;
        var xmax = this._xmax;
        var ymin = this._ymin;
        var ymax = this._ymax;
        //if (debug_level >= 1) console.log("ymax of raster:", ymax);

        var ScaleX = this._ScaleX;
        var ScaleY = this._ScaleY;

        var tiff_height = this.tiff_height;
        var tiff_width = this.tiff_width;

        var number_of_pixels_per_rectangle = tile_width / 8;

        for (var h = 0; h < number_of_rectangles_down; h++) {
            var lat = ymax_of_tile - (h + 0.5) * height_of_rectangle_in_degrees;
            //if (debug_level >= 2) console.log("lat:", lat);
            for (var w = 0; w < number_of_rectangles_across; w++) {
                var lng = xmin_of_tile + (w + 0.5) * width_of_rectangle_in_degrees;
                //if (debug_level >= 2) console.log("lng:", lng);
                if (lat > ymin && lat < ymax && lng > xmin && lng < xmax) {
                    (function () {
                        //if (debug_level >= 2) L.circleMarker([lat, lng], {color: "#00FF00"}).bindTooltip(h+","+w).addTo(this._map).openTooltip();
                        var x_in_raster_pixels = Math.floor((lng - xmin) / ScaleX);
                        var y_in_raster_pixels = Math.floor((ymax - lat) / ScaleY);
                        var rasterWindow = [x_in_raster_pixels, y_in_raster_pixels, x_in_raster_pixels + 1, y_in_raster_pixels + 1];

                        if (debug_level >= 1) time_started_reading_rasters = performance.now();
                        //let values = this._image.readRasters({ window: rasterWindow });
                        var values = _this.rasters.map(function (raster) {
                            return raster[y_in_raster_pixels * tiff_width + x_in_raster_pixels];
                        });
                        if (debug_level >= 1) duration_reading_rasters += performance.now() - time_started_reading_rasters;
                        var number_of_values = values.length;
                        var color = null;
                        if (number_of_values == 1) {
                            var value = values[0];
                            if (value != no_data_value) {
                                color = scale((values[0] - mins[0]) / ranges[0]).hex();
                            }
                        } else if (number_of_values == 2) {} else if (number_of_values == 3) {
                            if (values[0] != no_data_value) {
                                color = "rgb(" + values[0] + "," + values[1] + "," + values[2] + ")";
                            }
                        }
                        //let colors = ["red", "green", "blue", "pink", "purple", "orange"];
                        //let color = colors[Math.round(colors.length * Math.random())];
                        //context.fillStyle = this.getColor(color);
                        if (color) {
                            context.fillStyle = color;
                            if (debug_level >= 1) time_started_filling_rect = performance.now();
                            context.fillRect(w * width_of_rectangle_in_pixels, h * height_of_rectangle_in_pixels, width_of_rectangle_in_pixels, height_of_rectangle_in_pixels);
                            if (debug_level >= 1) duration_filling_rects += performance.now() - time_started_filling_rect;
                        }
                        //if (debug_level >= 2) console.log("filling:", [w * width_of_rectangle_in_pixels, h * height_of_rectangle_in_pixels, width_of_rectangle_in_pixels, height_of_rectangle_in_pixels]);
                        //if (debug_level >= 2) console.log("with color:", color);
                        //if (debug_level >= 2) console.log("with context:", context);
                    })();
                } else {
                        //if (debug_level >= 2) L.circleMarker([lat, lng], {color: "#FF0000"}).bindTooltip(h+","+w).addTo(this._map).openTooltip();
                    }
            }
        }

        if (debug_level >= 1) {
            var duration = performance.now() - start_time;
            console.log("creating tile took ", duration, "milliseconds");
            console.log("took", duration_reading_rasters, "milliseconds to read rasters, which is ", Math.round(duration_reading_rasters / duration * 100), "percentage of the total time");
            console.log("took", duration_filling_rects, "milliseconds to fill rects, which is ", Math.round(duration_filling_rects / duration * 100), "percentage of the total time");
        }
        //if (debug_level >= 1) console.groupEnd();
        // return the tile so it can be rendered on screen
        return tile;
    },

    // method from https://github.com/Leaflet/Leaflet/blob/bb1d94ac7f2716852213dd11563d89855f8d6bb1/src/layer/ImageOverlay.js
    getBounds: function getBounds() {
        return this._bounds;
    },

    getColor: function getColor(name) {
        var d = document.createElement("div");
        d.style.color = name;
        document.body.appendChild(d);
        return window.getComputedStyle(d).color;
    }
});

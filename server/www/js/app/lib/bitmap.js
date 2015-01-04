/**
 * (c) 2015 Edouard Lafargue, ed@lafargue.name
 *
 * This file is part of Wizkers.
 *
 * Wizkers is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wizkers is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Wizkers.  If not, see <http://www.gnu.org/licenses/>.
 */

/**

  Customised version of javascript BMP reading lib. B&W bitmap is optimized as
  an array of 32bit integers that map to individual pixels (32 pixels per integer).
  Adapted to be compliant with pure Javascript implementation, and not only Node.JS Buffer
  objects
  
  https://github.com/nowelium/node-bitmap

(The MIT License)

Copyright (c) 2012 Yusuke Hata

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

define(function(require) {
    "use strict";


var Bitmap = function(buffer){
  this.buffer = buffer;
  this.dv = new DataView(this.buffer.buffer);
  this.initialized = false;

  this.fileHeader = null;
  this.infoHeader = null;
  this.coreHeader = null;
  this.colorPalette = null;
  this.dataPos = -1;
};
Bitmap.prototype.CORE_TYPE_WINDOWS_V3 = 40;
Bitmap.prototype.CORE_TYPE_WINDOWS_V4 = 108;
Bitmap.prototype.CORE_TYPE_WINDOWS_V5 = 124;
Bitmap.prototype.CORE_TYPE_OS2_V1 = 12;
Bitmap.prototype.CORE_TYPE_OS2_V2 = 64;
Bitmap.prototype.BITMAPCOREHEADER = Bitmap.prototype.CORE_TYPE_OS2_V1;
Bitmap.prototype.BITMAPINFOHEADER = Bitmap.prototype.CORE_TYPE_WINDOWS_V3;
Bitmap.prototype.BITMAPINFOHEADER2 = Bitmap.prototype.CORE_TYPE_OS2_V2;
Bitmap.prototype.BITMAPV4HEADER = Bitmap.prototype.CORE_TYPE_WINDOWS_V4;
Bitmap.prototype.BITMAPV5HEADER = Bitmap.prototype.CORE_TYPE_WINDOWS_V5;
Bitmap.prototype.COMPRESSION_BI_RGB = 0;
Bitmap.prototype.COMPRESSION_BI_RLE8 = 1;
Bitmap.prototype.COMPRESSION_BI_RLE4 = 2;
Bitmap.prototype.COMPRESSION_BI_BITFIELDS = 3;
Bitmap.prototype.COMPRESSION_BI_JPEG = 4;
Bitmap.prototype.COMPRESSION_BI_PNG = 5;
Bitmap.prototype.BITCOUNT_2 = 1;
Bitmap.prototype.BITCOUNT_16 = 4;
Bitmap.prototype.BITCOUNT_256 = 8;
Bitmap.prototype.BITCOUNT_16bit = 16;
Bitmap.prototype.BITCOUNT_24bit = 24;
Bitmap.prototype.BITCOUNT_32bit = 32;
Bitmap.prototype.init = function(){
  this.readFileHeader();
  this.readInfoHeader();
  this.readCoreHeader();
  this.readColorPalette();

  this.initDataPos();
  this.initialized = true;
};
Bitmap.prototype.checkInit = function (){
  if(!this.initialized){
    throw new Error('not initialized');
  }
  /* nop */
};
Bitmap.prototype.isBitmap = function(){
  this.checkInit();

  if('BM' == this.fileHeader.bfType){
    return true;
  }
  return false;
};
Bitmap.prototype.getData = function (){
  this.checkInit();

  if(this.COMPRESSION_BI_RGB !== this.coreHeader.__copmression__){
    throw new Error('not supported compression: ' + this.coreHeader.__copmression__);
  }

  var bitCount = this.coreHeader.__bitCount__;
  var width = this.getWidth();
  var height = this.getHeight();

  var line = (width * bitCount) / 8;
  if(0 != (line % 4)){
    line = ((line / 4) + 1) * 4;
  }

    
  var rgbaData = [];
  var dataPos = this.dataPos;
  for(var i = 0; i < height; ++i) {
    var pos = dataPos + (line * (height - (i + 1)));
    var buf = new DataView(this.buffer.buffer,pos, line);
    var color = this.mapColor(buf, bitCount);
    rgbaData.push(color);
  }
  return rgbaData;
};
Bitmap.prototype.getWidth = function (){
  this.checkInit();

  return this.coreHeader.__width__;
};
Bitmap.prototype.getHeight = function (){
  this.checkInit();

  return this.coreHeader.__height__;
};
    
// Converted to work with ArrayBuffers rather than Node Buffers
Bitmap.prototype.read = function(buf, offset, limit){
  return buf.subarray(offset,offset+limit);
};
    
Bitmap.prototype.readFileHeader = function(){
    
  this.fileHeader = {
    bfType: this.buffer.subarray(0,2) , // Should be [66,78]
    bfSize: this.dv.getUint16(2,true),
    bfReserved1: 0,
    bfReserved2: 0,
    bfOffBits: this.dv.getUint16(10,true),
  };

};
    
Bitmap.prototype.readInfoHeader = function (){
  this.infoHeader = new DataView(this.buffer.buffer, 14, 4);
};
    
Bitmap.prototype.readCoreHeader = function (){
  var coreType = this.infoHeader.getUint16(0,true);
  switch(coreType){
  case this.BITMAPCOREHEADER:
    return this.readCoreHeaderOS2_V1();
  case this.BITMAPINFOHEADER2:
    return this.readCoreHeaderOS2_V2();
  case this.BITMAPV4HEADER:
    return this.readCoreHeaderWINDOWS_V4();
  case this.BITMAPV5HEADER:
    return this.readCoreHeaderWINDOWS_V5();
  case this.BITMAPINFOHEADER:
    return this.readCoreHeaderWINDOWS_V3();
  default:
    throw new Error('unknown coreType: ' + coreType);
  }
};
Bitmap.prototype.readCoreHeaderWINDOWS_V3 = function (){
  
  this.coreHeader = {
    __copmression__: this.dv.getUint16(0x1e,true),
    __bitCount__: this.dv.getUint8(0x1c),
    __width__: this.dv.getUint16(0x12,true),
    __height__: this.dv.getUint16(0x16,true),
    biWidth: this.dv.getUint16(0x12,true),
    biHeight: this.dv.getUint16(0x16,true),
    biPlanes: this.dv.getUint8(0x1a),
    biBitCount: this.dv.getUint8(0x1c),
    biCopmression: this.dv.getUint16(0x1e,true),
    biSizeImage: this.dv.getUint16(0x22,true),
    biXPixPerMeter: this.dv.getUint16(0x26,true),
    biYPixPerMeter: this.dv.getUint16(0x2a,true),
    biClrUsed: this.dv.getUint16(0x2e,true),
    biCirImportant: this.dv.getUint16(0x32,true),
  };
};
Bitmap.prototype.readCoreHeaderWINDOWS_V4 = function (){
  throw new Error('not yet impl');
  
  var bV4Width = this.read(this.buffer, 0x12, 4);
  var bV4Height = this.read(this.buffer, 0x16, 4);
  var bV4Planes = this.read(this.buffer, 0x1a, 2);
  var bV4BitCount = this.read(this.buffer, 0x1c, 2);
  var bV4Compression = this.read(this.buffer, 0x1e, 4);
  var bV4SizeImage = this.read(this.buffer, 0x22, 4);
  var bV4XPelsPerMeter = this.read(this.buffer, 0x26, 4);
  var bV4YPelsPerMeter = this.read(this.buffer, 0x2a, 4);
  var bV4ClrUsed = this.read(this.buffer, 0x2e, 4);
  var bV4ClrImportant = this.read(this.buffer, 0x32, 4);
  var bV4RedMask = this.read(this.buffer, 0x36, 4);
  var bV4GreenMask = this.read(this.buffer, 0x3a, 4);
  var bV4BlueMask = this.read(this.buffer, 0x3e, 4);
  var bV4AlphaMask = this.read(this.buffer, 0x42, 4);
  var bV4CSType = this.read(this.buffer, 0x46, 4);
  var bV4Endpoints = this.read(this.buffer, 0x6a, 36);
  var bV4GammaRed = this.read(this.buffer, 0x6e, 4);
  var bV4GammaGreen = this.read(this.buffer, 0x72, 4);
  var bV4GammaBlue = this.read(this.buffer, 0x76, 4);

  this.coreHeader = {
    __compression__: bV4Compression.readUInt16LE(0),
    __bitCount__: bV4BitCount.readUInt8(0),
    __width__: bV4Width.readUInt16LE(0),
    __height__: bV4Height.readUInt16LE(0),
    bV4Width: bV4Width.readUInt16LE(0),
    _bV4Width: bV4Width,
    bV4Height: bV4Height.readUInt16LE(0),
    _bV4Height: bV4Height,
    bV4Planes: bV4Planes.readUInt8(0),
    _bV4Planes: bV4Planes,
    bV4BitCount: bV4BitCount.readUInt8(0),
    _bV4BitCount: bV4BitCount,
    bV4Compression: bV4Compression.readUInt16LE(0),
    _bV4Compression: bV4Compression,
    bV4SizeImage: bV4SizeImage.readUInt16LE(0),
    _bV4SizeImage: bV4SizeImage,
    bV4XPelsPerMeter: bV4XPelsPerMeter.readUInt16LE(0),
    _bV4XPelsPerMeter: bV4XPelsPerMeter,
    bV4YPelsPerMeter: bV4YPelsPerMeter.readUInt16LE(0),
    _bV4YPelsPerMeter: bV4YPelsPerMeter,
    bV4ClrUsed: bV4ClrUsed.readUInt16LE(0),
    _bV4ClrUsed: bV4ClrUsed,
    bV4ClrImportant: bV4ClrImportant.readUInt16LE(0),
    _bV4ClrImportant: bV4ClrImportant,
    bV4RedMask: bV4RedMask.readUInt16LE(0),
    _bV4RedMask: bV4RedMask,
    bV4GreenMask: bV4GreenMask.readUInt16LE(0),
    _bV4GreenMask: bV4GreenMask,
    bV4BlueMask: bV4BlueMask.readUInt16LE(0),
    _bV4BlueMask: bV4BlueMask,
    bV4AlphaMask: bV4AlphaMask.readUInt16LE(0),
    _bV4AlphaMask: bV4AlphaMask,
    bV4CSType: bV4CSType.readUInt16LE(0),
    _bV4CSType: bV4CSType,
    bV4Endpoints: null,
    _bV4Endpoints: bV4Endpoints,
    bV4GammaRed: bV4GammaRed.readUInt16LE(0),
    _bV4GammaRed: bV4GammaRed,
    bV4GammaGreen: bV4GammaGreen.readUInt16LE(0),
    _bV4GammaGreen: bV4GammaGreen,
    bV4GammaBlue: bV4GammaBlue.readUInt16LE(0),
    _bV4GammaBlue: bV4GammaBlue
  };
};
Bitmap.prototype.readCoreHeaderWINDOWS_V5 = function (){
  throw new Error('not yet impl');

  var bV5Width = this.read(this.buffer, 0x12, 4);
  var bV5Height = this.read(this.buffer, 0x16, 4);
  var bV5Planes = this.read(this.buffer, 0x1a, 2);
  var bV5BitCount = this.read(this.buffer, 0x1c, 2);
  var bV5Compression = this.read(this.buffer, 0x1e, 4);
  var bV5SizeImage = this.read(this.buffer, 0x22, 4);
  var bV5XPelsPerMeter = this.read(this.buffer, 0x26, 4);
  var bV5YPelsPerMeter = this.read(this.buffer, 0x2a, 4);
  var bV5ClrUsed = this.read(this.buffer, 0x2e, 4);
  var bV5ClrImportant = this.read(this.buffer, 0x32, 4);
  var bV5RedMask = this.read(this.buffer, 0x36, 4);
  var bV5GreenMask = this.read(this.buffer, 0x3a, 4);
  var bV5BlueMask = this.read(this.buffer, 0x3e, 4);
  var bV5AlphaMask = this.read(this.buffer, 0x42, 4);
  var bV5CSType = this.read(this.buffer, 0x46, 4);
  var bV5Endpoints = this.read(this.buffer, 0x6a, 36);
  var bV5GammaRed = this.read(this.buffer, 0x6e, 4);
  var bV5GammaGreen = this.read(this.buffer, 0x72, 4);
  var bV5GammaBlue = this.read(this.buffer, 0x76, 4);
  var bV5Intent = this.read(this.buffer, 0x7a, 4);
  var bV5ProfileData = this.read(this.buffer, 0x7e, 4);
  var bV5ProfileSize = this.read(this.buffer, 0x82, 4);
  var bV5Reserved = this.read(this.buffer, 0x86, 4);

  this.coreHeader = {
    __compression__: bV5Compression.readUInt16LE(0),
    __bitCount__: bV5BitCount.readUInt8(0),
    __width__: bV5Width.readUInt16LE(0),
    __height__: bV5Height.readUInt16LE(0),
    bV5Width: bV5Width.readUInt16LE(0),
    _bV5Width: bV5Width,
    bV5Height: bV5Height.readUInt16LE(0),
    _bV5Height: bV5Height,
    bV5Planes: bV5Planes.readUInt8(0),
    _bV5Planes: bV5Planes,
    bV5BitCount: bV5BitCount.readUInt8(0),
    _bV5BitCount: bV5BitCount,
    bV5Compression: bV5Compression.readUInt16LE(0),
    _bV5Compression: bV5Compression,
    bV5SizeImage: bV5SizeImage.readUInt16LE(0),
    _bV5SizeImage: bV5SizeImage,
    bV5XPelsPerMeter: bV5XPelsPerMeter.readUInt16LE(0),
    _bV5XPelsPerMeter: bV5XPelsPerMeter,
    bV5YPelsPerMeter: bV5YPelsPerMeter.readUInt16LE(0),
    _bV5YPelsPerMeter: bV5YPelsPerMeter,
    bV5ClrUsed: bV5ClrUsed.readUInt16LE(0),
    _bV5ClrUsed: bV5ClrUsed,
    bV5ClrImportant: bV5ClrImportant.readUInt16LE(0),
    _bV5ClrImportant: bV5ClrImportant,
    bV5RedMask: bV5RedMask.readUInt16LE(0),
    _bV5RedMask: bV5RedMask,
    bV5GreenMask: bV5GreenMask.readUInt16LE(0),
    _bV5GreenMask: bV5GreenMask,
    bV5BlueMask: bV5BlueMask.readUInt16LE(0),
    _bV5BlueMask: bV5BlueMask,
    bV5AlphaMask: bV5AlphaMask.readUInt16LE(0),
    _bV5AlphaMask: bV5AlphaMask,
    bV5CSType: bV5CSType.readUInt16LE(0),
    _bV5CSType: bV5CSType,
    bV5Endpoints: null,
    _bV5Endpoints: bV5Endpoints,
    bV5GammaRed: bV5GammaRed.readUInt16LE(0),
    _bV5GammaRed: bV5GammaRed,
    bV5GammaGreen: bV5GammaGreen.readUInt16LE(0),
    _bV5GammaGreen: bV5GammaGreen,
    bV5GammaBlue: bV5GammaBlue.readUInt16LE(0),
    _bV5GammaBlue: bV5GammaBlue,
    bV5Intent: bV5Intent.readUInt16LE(0),
    _bV5Intent: bV5Intent,
    bV5ProfileData: bV5ProfileData.readUInt16LE(0),
    _bV5ProfileData: bV5ProfileData,
    bV5ProfileSize: bV5ProfileSize.readUInt16LE(0),
    _bV5ProfileSize: bV5ProfileSize,
    bV5Reserved: 0,
    _bV5Reserved: bV5Reserved
  };
};
Bitmap.prototype.readCoreHeaderOS2_V1 = function (){
  throw new Error('not yet impl');

  var bcWidth = this.read(this.buffer, 0x12, 2);
  var bcHeight = this.read(this.buffer, 0x14, 2);
  var bcPlanes = this.read(this.buffer, 0x16, 2);
  var bcBitCount = this.read(this.buffer, 0x18, 2);

  this.coreHeader = {
    __compression__: 0,
    __bitCount__: bcBitCount.readUInt8(0),
    __width__: bcWidth.readUInt8(0),
    __height__: bcHeight.readUInt8(0),
    bcWidth: bcWidth.readUInt8(0),
    _bcWidth: bcWidth,
    bcHeight: bcHeight.readUInt8(0),
    _bcHeight: bcHeight,
    bcPlanes: bcPlanes.readUInt8(0),
    _bcPlanes: bcPlanes,
    bcBitCount: bcBitCount.readUInt8(0),
    _bcBitCount: bcBitCount
  };
};
Bitmap.prototype.readCoreHeaderOS2_V2 = function (){
  throw new Error('not yet impl');

  var cx = this.read(this.buffer, 0x12, 4);
  var cy = this.read(this.buffer, 0x16, 4);
  var cPlanes = this.read(this.buffer, 0x1a, 2);
  var cBitCount = this.read(this.buffer, 0x1c, 2);
  var ulCompression = this.read(this.buffer, 0x1e, 4);
  var cbImage = this.read(this.buffer, 0x22, 4);
  var cxResolution = this.read(this.buffer, 0x26, 4);
  var cyResolution = this.read(this.buffer, 0x2a, 4);
  var cclrUsed = this.read(this.buffer, 0x2e, 4);
  var cclrImportant = this.read(this.buffer, 0x32, 4);
  var usUnits = this.read(this.buffer, 0x36, 2);
  var usReserved = this.read(this.buffer, 0x38, 2);
  var usRecording = this.read(this.buffer, 0x3a, 2);
  var usRendering = this.read(this.buffer, 0x3c, 2);
  var cSize1 = this.read(this.buffer, 0x3e, 4);
  var cSize2 = this.read(this.buffer, 0x42, 4);
  var ulColorEncoding = this.read(this.buffer, 0x46, 4);
  var ulIdentifier = this.read(this.buffer, 0x4a, 4);

  this.coreHeader = {
    __compression__: ulCompression.readUInt16LE(0),
    __bitCount__: cBitCount.readUInt8(0),
    __width__: cx.readUInt16LE(0),
    __height__: cy.readUInt16LE(0),
    cx: cx.readUInt16LE(0),
    _cx: cx,
    cy: cy.readUInt16LE(0),
    _cy: cy,
    cPlanes: cPlanes.readUInt8(0),
    _cPlanes: cPlanes,
    cBitCount: cBitCount.readUInt8(0),
    _cBitCount: cBitCount,
    ulCompression: ulCompression.readUInt16LE(0),
    _ulCompression: ulCompression,
    cbImage: cbImage.readUInt16LE(0),
    _cbImage: cbImage,
    cxResolution: cxResolution.readUInt16LE(0),
    _cxResolution: cxResolution,
    cyResolution: cyResolution.readUInt16LE(0),
    _cyResolution: cyResolution,
    cclrUsed: cclrUsed.readUInt16LE(0),
    _cclrUsed: cclrUsed,
    cclrImportant: cclrImportant.readUInt16LE(0),
    _cclrImportant: cclrImportant,
    usUnits: usUnits.readUInt8(0),
    _usUnits: usUnits,
    usReserved: usReserved.readUInt8(0),
    _usReserved: usReserved,
    usRecording: usRecording.readUInt8(0),
    _usRecording: usRecording,
    usRendering: usRendering.readUInt8(0),
    _usRendering: usRendering,
    cSize1: cSize1.readUInt16LE(0),
    _cSize1: cSize1,
    cSize2: cSize2.readUInt16LE(0),
    _cSize2: cSize2,
    ulColorEncoding: ulColorEncoding.readUInt16LE(0),
    _ulColorEncoding: ulColorEncoding,
    ulIdentifier: ulIdentifier.readUInt16LE(0),
    _ulIdentifier: ulIdentifier
  };
};
Bitmap.prototype.readColorPalette = function (){
  var bitCount = this.coreHeader.__bitCount__;
  if(this.BITCOUNT_16bit == bitCount){
    return /* nop */;
  }
  if(this.BITCOUNT_24bit == bitCount){
    return /* nop */;
  }
  if(this.BITCOUNT_32bit == bitCount){
    return /* nop */;
  }

  var coreType = this.infoHeader.getUint16(0,true);
  switch(coreType){
  case this.BITMAPCOREHEADER:
    return this.readColorPalette_RGBTRIPLE(bitCount, 0x1a);
  case this.BITMAPINFOHEADER2:
    return this.readColorPalette_RGBTRIPLE(bitCount, 0x4e);
    case this.BITMAPV4HEADER:
    return this.readColorPalette_RGBQUAD(bitCount, 0x7a);
  case this.BITMAPV5HEADER:
    return this.readColorPalette_RGBQUAD(bitCount, 0x8a);
  case this.BITMAPINFOHEADER:
    return this.readColorPalette_RGBQUAD(bitCount, 0x36);
  default:
    throw new Error('unknown colorPalette: ' + coreType + ',' + bitCount);
  }
};
Bitmap.prototype.readColorPalette_RGBTRIPLE = function (bitCount, startPos){
  throw new Error('not yet impl');
};
Bitmap.prototype.readColorPalette_RGBQUAD = function (bitCount, startPos){
  if(this.BITCOUNT_2 == bitCount){
    return this.readRGBQUAD(1 << this.BITCOUNT_2, startPos);
  }
  if(this.BITCOUNT_16 == bitCount){
    return this.readRGBQUAD(1 << this.BITCOUNT_16, startPos);
  }
  if(this.BITCOUNT_256 == bitCount){
    return this.readRGBQUAD(1 << this.BITCOUNT_256, startPos);
  }
  throw new Error('unknown bitCount: ' + bitCount);
};
Bitmap.prototype.readRGBQUAD = function(count, startPos){
  var palette = [];
  for(var i = startPos, len = startPos + (4 * count); i < len; i += 4){
    palette.push({
      rgbBlue: this.dv.getUint8(i),
      rgbGreen: this.dv.getUint8(i+1),
      rgbRed: this.dv.getUint8(i+2),
      rgbReserved: this.dv.getUint8(i+3),
    });
  }
  this.colorPalette = palette;
};
Bitmap.prototype.initDataPos = function(){
  var bitCount = this.coreHeader.__bitCount__;
  var hasPalette = true;
  if(this.BITCOUNT_16bit == bitCount){
    hasPalette = true;
  }
  if(this.BITCOUNT_24bit == bitCount){
    hasPalette = true;
  }
  if(this.BITCOUNT_32bit == bitCount){
    hasPalette = true;
  }

  var coreType = this.infoHeader.getUint16(0,true);
  switch(coreType){
  case this.BITMAPCOREHEADER:
    this.dataPos = 0x1a;
    if(hasPalette){
      this.dataPos = this.dataPos + (3 * (1 << bitCount));
    }
    break;
  case this.BITMAPINFOHEADER2:
    this.dataPos = 0x4e;
    if(hasPalette){
      this.dataPos = this.dataPos + (3 * (1 << bitCount));
    }
    break;
  case this.BITMAPV4HEADER:
    this.dataPos = 0x7a;
    if(hasPalette){
      this.dataPos = this.dataPos + (4 * (1 << bitCount));
    }
    break;
  case this.BITMAPV5HEADER:
    this.dataPos = 0x8a;
    if(hasPalette){
      this.dataPos = this.dataPos + (4 * (1 << bitCount));
    }
  case this.BITMAPINFOHEADER:
    this.dataPos = 0x36;
    if(hasPalette){
      this.dataPos = this.dataPos + (4 * (1 << bitCount));
    }
    break;
  default:
    throw new Error('unknown colorPalette: ' + coreType + ',' + bitCount);
  }
};

// VizApp : this BMP library is modified to return optimized
// black and white bitmap data packed as 32bit integers.
// TODO: discards alpha every time...
Bitmap.prototype.mapRGBA = function(r, g, b, a){
    return (r << 16) | (g << 8) | b;
};

Bitmap.prototype.mapColor = function(bmpBuf, bitCount){
  var b, g, r, a;
  var length = bmpBuf.byteLength;
  var colorData = [];

    // Black and White BMP
    // We compress 32 pixels into one 32bit integer:
  if(this.BITCOUNT_2 == bitCount){
    for(var i = 0; i < length; i ++){
       colorData.push(bmpBuf.getUint8(i++) << 24 | bmpBuf.getUint8(i++) << 16 | bmpBuf.getUint8(i++) << 8 | bmpBuf.getUint8(i));
    }
    return colorData;
  }
  if(this.BITCOUNT_16 == bitCount){
    for(var i = 0; i < length; i += 2){
      var paletteHigh = bmpBuf.getUint8(i);
      var paletteLow = bmpBuf.getUint8(i + 1);
      var indexes = [paletteHigh, paletteLow];
      indexes.forEach(function(paletteIndex){
        var palette = this.colorPalette[paletteIndex];
        colorData.push(this.mapRGBA(palette.rgbRed, palette.rgbGreen, palette.rgbBlue, -1));
      });
    }

    return colorData;
  }
  if(this.BITCOUNT_256 == bitCount){
    for(var i = 0; i < length; ++i){
      var paletteIndex = bmpBuf.getUint8(i,true);
      var palette = this.colorPalette[paletteIndex];
      colorData.push(this.mapRGBA(palette.rgbRed, palette.rgbGreen, palette.rgbBlue, -1));
    }
    return colorData;
  }
  if(this.BITCOUNT_16bit == bitCount){
    for(var i = 0; i < length; i += 3){
      b = bmpBuf[i];
      g = bmpBuf[i + 1];
      r = bmpBuf[i + 2];
      colorData.push(this.mapRGBA(r, g, b, -1));
    }
    return colorData;
  }
  if(this.BITCOUNT_24bit == bitCount){
    for(var i = 0; i < length; i += 3){
      b = bmpBuf[i];
      g = bmpBuf[i + 1];
      r = bmpBuf[i + 2];
      colorData.push(this.mapRGBA(r, g, b, -1));
    }
    return colorData;
  }
  if(this.BITCOUNT_32bit == bitCount){
    for(var i = 0; i < length; i += 4){
      b = bmpBuf[i];
      g = bmpBuf[i + 1];
      r = bmpBuf[i + 2];
      a = bmpBuf[i + 3];
      colorData.push(this.mapRGBA(r, g, b, a));
    }
    return colorData;
  }
  throw new Error('unknown bitCount: ' + bitCount);
};
    
    return Bitmap;
});

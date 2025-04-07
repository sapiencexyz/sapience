"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@stablelib+wipe@1.0.1";
exports.ids = ["vendor-chunks/@stablelib+wipe@1.0.1"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/@stablelib+wipe@1.0.1/node_modules/@stablelib/wipe/lib/wipe.js":
/*!***********************************************************************************************!*\
  !*** ../../node_modules/.pnpm/@stablelib+wipe@1.0.1/node_modules/@stablelib/wipe/lib/wipe.js ***!
  \***********************************************************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\n// Copyright (C) 2016 Dmitry Chestnykh\n// MIT License. See LICENSE file for details.\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n/**\n * Sets all values in the given array to zero and returns it.\n *\n * The fact that it sets bytes to zero can be relied on.\n *\n * There is no guarantee that this function makes data disappear from memory,\n * as runtime implementation can, for example, have copying garbage collector\n * that will make copies of sensitive data before we wipe it. Or that an\n * operating system will write our data to swap or sleep image. Another thing\n * is that an optimizing compiler can remove calls to this function or make it\n * no-op. There's nothing we can do with it, so we just do our best and hope\n * that everything will be okay and good will triumph over evil.\n */\nfunction wipe(array) {\n    // Right now it's similar to array.fill(0). If it turns\n    // out that runtimes optimize this call away, maybe\n    // we can try something else.\n    for (var i = 0; i < array.length; i++) {\n        array[i] = 0;\n    }\n    return array;\n}\nexports.wipe = wipe;\n//# sourceMappingURL=wipe.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0BzdGFibGVsaWIrd2lwZUAxLjAuMS9ub2RlX21vZHVsZXMvQHN0YWJsZWxpYi93aXBlL2xpYi93aXBlLmpzIiwibWFwcGluZ3MiOiJBQUFhO0FBQ2I7QUFDQTtBQUNBLDhDQUE2QyxFQUFFLGFBQWEsRUFBQztBQUM3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLGtCQUFrQjtBQUN0QztBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVk7QUFDWiIsInNvdXJjZXMiOlsid2VicGFjazovL0Bmb2lsL2FwcC8uLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vQHN0YWJsZWxpYit3aXBlQDEuMC4xL25vZGVfbW9kdWxlcy9Ac3RhYmxlbGliL3dpcGUvbGliL3dpcGUuanM/YTBhMSJdLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcbi8vIENvcHlyaWdodCAoQykgMjAxNiBEbWl0cnkgQ2hlc3RueWtoXG4vLyBNSVQgTGljZW5zZS4gU2VlIExJQ0VOU0UgZmlsZSBmb3IgZGV0YWlscy5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbi8qKlxuICogU2V0cyBhbGwgdmFsdWVzIGluIHRoZSBnaXZlbiBhcnJheSB0byB6ZXJvIGFuZCByZXR1cm5zIGl0LlxuICpcbiAqIFRoZSBmYWN0IHRoYXQgaXQgc2V0cyBieXRlcyB0byB6ZXJvIGNhbiBiZSByZWxpZWQgb24uXG4gKlxuICogVGhlcmUgaXMgbm8gZ3VhcmFudGVlIHRoYXQgdGhpcyBmdW5jdGlvbiBtYWtlcyBkYXRhIGRpc2FwcGVhciBmcm9tIG1lbW9yeSxcbiAqIGFzIHJ1bnRpbWUgaW1wbGVtZW50YXRpb24gY2FuLCBmb3IgZXhhbXBsZSwgaGF2ZSBjb3B5aW5nIGdhcmJhZ2UgY29sbGVjdG9yXG4gKiB0aGF0IHdpbGwgbWFrZSBjb3BpZXMgb2Ygc2Vuc2l0aXZlIGRhdGEgYmVmb3JlIHdlIHdpcGUgaXQuIE9yIHRoYXQgYW5cbiAqIG9wZXJhdGluZyBzeXN0ZW0gd2lsbCB3cml0ZSBvdXIgZGF0YSB0byBzd2FwIG9yIHNsZWVwIGltYWdlLiBBbm90aGVyIHRoaW5nXG4gKiBpcyB0aGF0IGFuIG9wdGltaXppbmcgY29tcGlsZXIgY2FuIHJlbW92ZSBjYWxscyB0byB0aGlzIGZ1bmN0aW9uIG9yIG1ha2UgaXRcbiAqIG5vLW9wLiBUaGVyZSdzIG5vdGhpbmcgd2UgY2FuIGRvIHdpdGggaXQsIHNvIHdlIGp1c3QgZG8gb3VyIGJlc3QgYW5kIGhvcGVcbiAqIHRoYXQgZXZlcnl0aGluZyB3aWxsIGJlIG9rYXkgYW5kIGdvb2Qgd2lsbCB0cml1bXBoIG92ZXIgZXZpbC5cbiAqL1xuZnVuY3Rpb24gd2lwZShhcnJheSkge1xuICAgIC8vIFJpZ2h0IG5vdyBpdCdzIHNpbWlsYXIgdG8gYXJyYXkuZmlsbCgwKS4gSWYgaXQgdHVybnNcbiAgICAvLyBvdXQgdGhhdCBydW50aW1lcyBvcHRpbWl6ZSB0aGlzIGNhbGwgYXdheSwgbWF5YmVcbiAgICAvLyB3ZSBjYW4gdHJ5IHNvbWV0aGluZyBlbHNlLlxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJyYXlbaV0gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gYXJyYXk7XG59XG5leHBvcnRzLndpcGUgPSB3aXBlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9d2lwZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/@stablelib+wipe@1.0.1/node_modules/@stablelib/wipe/lib/wipe.js\n");

/***/ })

};
;
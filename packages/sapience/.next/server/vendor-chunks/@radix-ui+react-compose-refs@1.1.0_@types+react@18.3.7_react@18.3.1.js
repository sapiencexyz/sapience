"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@radix-ui+react-compose-refs@1.1.0_@types+react@18.3.7_react@18.3.1";
exports.ids = ["vendor-chunks/@radix-ui+react-compose-refs@1.1.0_@types+react@18.3.7_react@18.3.1"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.0_@types+react@18.3.7_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs":
/*!*************************************************************************************************************************************************************!*\
  !*** ../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.0_@types+react@18.3.7_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs ***!
  \*************************************************************************************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   composeRefs: () => (/* binding */ composeRefs),\n/* harmony export */   useComposedRefs: () => (/* binding */ useComposedRefs)\n/* harmony export */ });\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ \"(ssr)/../../node_modules/.pnpm/next@14.2.23_@babel+core@7.26.10_@opentelemetry+api@1.9.0_@playwright+test@1.47.1_babel-plugi_fftpjagusoflf64cyhjcuifhwa/node_modules/next/dist/server/future/route-modules/app-page/vendored/ssr/react.js\");\n// packages/react/compose-refs/src/composeRefs.tsx\n\nfunction setRef(ref, value) {\n  if (typeof ref === \"function\") {\n    ref(value);\n  } else if (ref !== null && ref !== void 0) {\n    ref.current = value;\n  }\n}\nfunction composeRefs(...refs) {\n  return (node) => refs.forEach((ref) => setRef(ref, node));\n}\nfunction useComposedRefs(...refs) {\n  return react__WEBPACK_IMPORTED_MODULE_0__.useCallback(composeRefs(...refs), refs);\n}\n\n//# sourceMappingURL=index.mjs.map\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0ByYWRpeC11aStyZWFjdC1jb21wb3NlLXJlZnNAMS4xLjBfQHR5cGVzK3JlYWN0QDE4LjMuN19yZWFjdEAxOC4zLjEvbm9kZV9tb2R1bGVzL0ByYWRpeC11aS9yZWFjdC1jb21wb3NlLXJlZnMvZGlzdC9pbmRleC5tanMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDK0I7QUFDL0I7QUFDQTtBQUNBO0FBQ0EsSUFBSTtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBUyw4Q0FBaUI7QUFDMUI7QUFJRTtBQUNGIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vQGZvaWwvYXBwLy4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS9AcmFkaXgtdWkrcmVhY3QtY29tcG9zZS1yZWZzQDEuMS4wX0B0eXBlcytyZWFjdEAxOC4zLjdfcmVhY3RAMTguMy4xL25vZGVfbW9kdWxlcy9AcmFkaXgtdWkvcmVhY3QtY29tcG9zZS1yZWZzL2Rpc3QvaW5kZXgubWpzPzQ2ZmYiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gcGFja2FnZXMvcmVhY3QvY29tcG9zZS1yZWZzL3NyYy9jb21wb3NlUmVmcy50c3hcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiO1xuZnVuY3Rpb24gc2V0UmVmKHJlZiwgdmFsdWUpIHtcbiAgaWYgKHR5cGVvZiByZWYgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJlZih2YWx1ZSk7XG4gIH0gZWxzZSBpZiAocmVmICE9PSBudWxsICYmIHJlZiAhPT0gdm9pZCAwKSB7XG4gICAgcmVmLmN1cnJlbnQgPSB2YWx1ZTtcbiAgfVxufVxuZnVuY3Rpb24gY29tcG9zZVJlZnMoLi4ucmVmcykge1xuICByZXR1cm4gKG5vZGUpID0+IHJlZnMuZm9yRWFjaCgocmVmKSA9PiBzZXRSZWYocmVmLCBub2RlKSk7XG59XG5mdW5jdGlvbiB1c2VDb21wb3NlZFJlZnMoLi4ucmVmcykge1xuICByZXR1cm4gUmVhY3QudXNlQ2FsbGJhY2soY29tcG9zZVJlZnMoLi4ucmVmcyksIHJlZnMpO1xufVxuZXhwb3J0IHtcbiAgY29tcG9zZVJlZnMsXG4gIHVzZUNvbXBvc2VkUmVmc1xufTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWluZGV4Lm1qcy5tYXBcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.0_@types+react@18.3.7_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs\n");

/***/ })

};
;
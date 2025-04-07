"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@motionone+types@10.17.1";
exports.ids = ["vendor-chunks/@motionone+types@10.17.1"];
exports.modules = {

/***/ "(ssr)/../../node_modules/.pnpm/@motionone+types@10.17.1/node_modules/@motionone/types/dist/MotionValue.es.js":
/*!**************************************************************************************************************!*\
  !*** ../../node_modules/.pnpm/@motionone+types@10.17.1/node_modules/@motionone/types/dist/MotionValue.es.js ***!
  \**************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   MotionValue: () => (/* binding */ MotionValue)\n/* harmony export */ });\n/**\n * The MotionValue tracks the state of a single animatable\n * value. Currently, updatedAt and current are unused. The\n * long term idea is to use this to minimise the number\n * of DOM reads, and to abstract the DOM interactions here.\n */\nclass MotionValue {\n    setAnimation(animation) {\n        this.animation = animation;\n        animation === null || animation === void 0 ? void 0 : animation.finished.then(() => this.clearAnimation()).catch(() => { });\n    }\n    clearAnimation() {\n        this.animation = this.generator = undefined;\n    }\n}\n\n\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0Btb3Rpb25vbmUrdHlwZXNAMTAuMTcuMS9ub2RlX21vZHVsZXMvQG1vdGlvbm9uZS90eXBlcy9kaXN0L01vdGlvblZhbHVlLmVzLmpzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxrSUFBa0k7QUFDbEk7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFdUIiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9AZm9pbC9hcHAvLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL0Btb3Rpb25vbmUrdHlwZXNAMTAuMTcuMS9ub2RlX21vZHVsZXMvQG1vdGlvbm9uZS90eXBlcy9kaXN0L01vdGlvblZhbHVlLmVzLmpzPzY3NTMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUaGUgTW90aW9uVmFsdWUgdHJhY2tzIHRoZSBzdGF0ZSBvZiBhIHNpbmdsZSBhbmltYXRhYmxlXG4gKiB2YWx1ZS4gQ3VycmVudGx5LCB1cGRhdGVkQXQgYW5kIGN1cnJlbnQgYXJlIHVudXNlZC4gVGhlXG4gKiBsb25nIHRlcm0gaWRlYSBpcyB0byB1c2UgdGhpcyB0byBtaW5pbWlzZSB0aGUgbnVtYmVyXG4gKiBvZiBET00gcmVhZHMsIGFuZCB0byBhYnN0cmFjdCB0aGUgRE9NIGludGVyYWN0aW9ucyBoZXJlLlxuICovXG5jbGFzcyBNb3Rpb25WYWx1ZSB7XG4gICAgc2V0QW5pbWF0aW9uKGFuaW1hdGlvbikge1xuICAgICAgICB0aGlzLmFuaW1hdGlvbiA9IGFuaW1hdGlvbjtcbiAgICAgICAgYW5pbWF0aW9uID09PSBudWxsIHx8IGFuaW1hdGlvbiA9PT0gdm9pZCAwID8gdm9pZCAwIDogYW5pbWF0aW9uLmZpbmlzaGVkLnRoZW4oKCkgPT4gdGhpcy5jbGVhckFuaW1hdGlvbigpKS5jYXRjaCgoKSA9PiB7IH0pO1xuICAgIH1cbiAgICBjbGVhckFuaW1hdGlvbigpIHtcbiAgICAgICAgdGhpcy5hbmltYXRpb24gPSB0aGlzLmdlbmVyYXRvciA9IHVuZGVmaW5lZDtcbiAgICB9XG59XG5cbmV4cG9ydCB7IE1vdGlvblZhbHVlIH07XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/.pnpm/@motionone+types@10.17.1/node_modules/@motionone/types/dist/MotionValue.es.js\n");

/***/ })

};
;
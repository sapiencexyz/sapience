;(function () {
  function computeTargetTab(path) {
    var isUserGuide = path.indexOf("/user-guide") === 0;
    var isBuilderGuide = (
      path.indexOf("/getting-started") === 0 ||
      path.indexOf("/guides") === 0 ||
      path.indexOf("/api") === 0 ||
      path.indexOf("/reference") === 0 ||
      path === "/storybook" ||
      path.indexOf("/faq") === 0 ||
      path.indexOf("/contributing") === 0
    );
    return { isUserGuide: isUserGuide, isBuilderGuide: !isUserGuide && isBuilderGuide };
  }

  function applyActive(path) {
    try {
      var selUser = '.vocs_Sidebar_group > section:first-of-type .vocs_Sidebar_items > a[href="/user-guide/introduction/what-is-sapience"]';
      var selBuilder = '.vocs_Sidebar_group > section:first-of-type .vocs_Sidebar_items > a[href="/getting-started/what-is-sapience"]';
      var userGuideAnchor = document.querySelector(selUser);
      var builderGuideAnchor = document.querySelector(selBuilder);
      if (!userGuideAnchor && !builderGuideAnchor) return false;

      userGuideAnchor && userGuideAnchor.classList.remove("is-active-tab");
      builderGuideAnchor && builderGuideAnchor.classList.remove("is-active-tab");

      var target = computeTargetTab(path);
      if (target.isUserGuide && userGuideAnchor) userGuideAnchor.classList.add("is-active-tab");
      if (target.isBuilderGuide && builderGuideAnchor) builderGuideAnchor.classList.add("is-active-tab");
      return true;
    } catch (_) {
      return false;
    }
  }

  function init() {
    var path = location.pathname || "";
    var applied = applyActive(path);

    // If not applied (anchors may not be in DOM yet), observe for changes and retry
    if (!applied) {
      var sidebarRoot = document.querySelector('.vocs_Sidebar_group');
      var observer = new MutationObserver(function () {
        if (applyActive(location.pathname || "")) {
          observer.disconnect();
        }
      });
      if (sidebarRoot) {
        observer.observe(sidebarRoot, { childList: true, subtree: true });
      } else {
        // As a fallback, observe the whole document body briefly
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();



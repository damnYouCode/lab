(function () {
  "use strict";

  var listEl = document.getElementById("ideas");
  var form = document.getElementById("idea-form");
  var input = document.getElementById("idea-input");
  var STORAGE_KEY = "lab-local-ideas";

  function render(ideas) {
    listEl.innerHTML = "";
    if (!ideas.length) {
      var empty = document.createElement("li");
      empty.textContent = "No ideas yet.";
      listEl.appendChild(empty);
      return;
    }
    ideas.forEach(function (idea) {
      var li = document.createElement("li");
      if (idea.example) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Example";
        li.appendChild(tag);
      }
      li.appendChild(document.createTextNode(idea.text));
      listEl.appendChild(li);
    });
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocal(ideas) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }

  function merge(seed, local) {
    return seed.concat(local);
  }

  fetch("data/ideas.json")
    .then(function (r) {
      if (!r.ok) throw new Error("ideas.json missing");
      return r.json();
    })
    .then(function (seed) {
      var local = loadLocal();
      render(merge(Array.isArray(seed) ? seed : [], local));

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = (input.value || "").trim();
        if (!text) return;
        local.push({ text: text, example: false });
        saveLocal(local);
        input.value = "";
        render(merge(seed, local));
      });
    })
    .catch(function () {
      var local = loadLocal();
      render(local.length ? local : [{ text: "Could not load data/ideas.json", example: true }]);
    });
})();

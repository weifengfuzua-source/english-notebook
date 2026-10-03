const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function annotatedEnglish(unit) {
  let cursor = 0;
  const parts = [];
  const annotations = unit.annotations.map((annotation, index) => ({ ...annotation, index, start: unit.english.indexOf(annotation.text) })).sort((a, b) => a.start - b.start);
  for (const annotation of annotations) {
    parts.push(escape(unit.english.slice(cursor, annotation.start)));
    parts.push(`<mark class="reading-annotation annotation-${annotation.type}" role="button" tabindex="0" data-annotation="${annotation.index}" aria-expanded="false" aria-controls="annotation-${unit.id}" aria-label="${escape(annotation.text)}，查看本句批注">${escape(annotation.text)}</mark>`);
    cursor = annotation.start + annotation.text.length;
  }
  parts.push(escape(unit.english.slice(cursor)));
  return parts.join("");
}

export function renderReading(reading) {
  return `<section class="article-section annotated-reading" aria-labelledby="reading-title">
    <h2 id="reading-title">原文 · 逐句精读</h2>
    <p class="reading-guide">轻点标注，在原句下方查看释义；再次轻点即可收起。</p>
    <p class="reading-legend"><span class="legend-vocabulary">单词</span><span class="legend-phrase">词块 / 句式</span><span class="legend-error">易错</span></p>
    ${reading.groups.map((group) => `<section class="reading-group" aria-labelledby="group-${group.id}">
      <h3 id="group-${group.id}"><span class="reading-group-number">${String(group.id).padStart(2, "0")}</span>${escape(group.title)}</h3>
      ${reading.units.filter((unit) => unit.group === group.id).map((unit) => `<div class="reading-unit" data-unit="${unit.id}">
        <p class="unit-english" lang="en">${annotatedEnglish(unit)}</p>
        <div class="annotation-panel" id="annotation-${unit.id}" aria-live="polite" hidden></div>
        <p class="unit-translation" lang="zh-CN"><span class="translation-label">译</span>${escape(unit.translation)}</p>
      </div>`).join("")}
    </section>`).join("")}
  </section>`;
}

export function bindReading(container, reading) {
  function toggle(mark) {
    const unitNode = mark.closest(".reading-unit");
    const unit = reading.units.find((item) => item.id === unitNode.dataset.unit);
    const annotation = unit.annotations[Number(mark.dataset.annotation)];
    const panel = unitNode.querySelector(".annotation-panel");
    const close = mark.getAttribute("aria-expanded") === "true";
    unitNode.querySelectorAll(".reading-annotation").forEach((item) => item.setAttribute("aria-expanded", "false"));
    panel.hidden = close;
    if (close) { panel.replaceChildren(); return; }
    mark.setAttribute("aria-expanded", "true");
    panel.innerHTML = `<p class="annotation-title" lang="en">${escape(annotation.label || annotation.text)}</p>
      <p class="annotation-meaning">${escape(annotation.meaning)}</p>
      <p class="annotation-context"><span class="annotation-label">本句：</span><span lang="en">${escape(annotation.text)}</span><br>${escape(annotation.context)}</p>
      <p class="annotation-note ${annotation.type === "error" ? "annotation-caution" : ""}"><span class="annotation-label">注意：</span>${escape(annotation.note)}</p>`;
  }
  container.addEventListener("click", (event) => {
    const mark = event.target.closest(".reading-annotation");
    if (mark && container.contains(mark)) toggle(mark);
  });
  container.addEventListener("keydown", (event) => {
    const mark = event.target.closest(".reading-annotation");
    if (!mark) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(mark); }
    if (event.key === "Escape" && mark.getAttribute("aria-expanded") === "true") { event.preventDefault(); toggle(mark); }
  });
}

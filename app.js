(() => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const state = {
    catalog: null,
    photos: [],
    lightboxIndex: -1,
    selectMode: false,
    selected: new Set(),
    actionStatusTimer: null,
  };

  const els = {
    status: document.getElementById("galleryStatus"),
    statusText: document.getElementById("galleryStatusText"),
    grid: document.getElementById("galleryGrid"),
    empty: document.getElementById("emptyState"),
    toolbar: document.getElementById("galleryToolbar"),
    selectAllToggle: document.getElementById("selectAllToggle"),
    selectionCount: document.getElementById("selectionCount"),
    selectPhotosBtn: document.getElementById("selectPhotosBtn"),
    clearSelectionBtn: document.getElementById("clearSelectionBtn"),
    downloadSelectedBtn: document.getElementById("downloadSelectedBtn"),
    actionStatus: document.getElementById("galleryActionStatus"),
    lightbox: document.getElementById("lightbox"),
    lightboxImage: document.getElementById("lightboxImage"),
    lightboxCaption: document.getElementById("lightboxCaption"),
    lightboxClose: document.getElementById("lightboxClose"),
    lightboxPrev: document.getElementById("lightboxPrev"),
    lightboxNext: document.getElementById("lightboxNext"),
    lightboxDownload: document.getElementById("lightboxDownload"),
    lightboxShare: document.getElementById("lightboxShare"),
  };

  function setStatus(mode, text) {
    if (!els.status || !els.statusText) return;
    els.status.classList.remove("is-empty", "is-live");
    if (mode) els.status.classList.add(mode);
    els.statusText.textContent = text;
  }

  function setActionStatus(text, isError = false) {
    if (!els.actionStatus) return;
    if (state.actionStatusTimer) {
      clearTimeout(state.actionStatusTimer);
      state.actionStatusTimer = null;
    }
    if (!text) {
      els.actionStatus.hidden = true;
      els.actionStatus.textContent = "";
      els.actionStatus.classList.remove("is-error");
      return;
    }
    els.actionStatus.hidden = false;
    els.actionStatus.textContent = text;
    els.actionStatus.classList.toggle("is-error", Boolean(isError));
    state.actionStatusTimer = setTimeout(() => {
      els.actionStatus.hidden = true;
      els.actionStatus.textContent = "";
      els.actionStatus.classList.remove("is-error");
      state.actionStatusTimer = null;
    }, 4200);
  }

  function normalizeCatalog(data) {
    const photos = Array.isArray(data?.photos) ? data.photos : [];
    return {
      event: data?.event || "2026 SAX Business Symposium",
      updatedAt: data?.updatedAt || null,
      photos: photos
        .filter((p) => p && typeof p.src === "string" && p.src.trim())
        .map((p, idx) => ({
          id: p.id || `photo-${idx + 1}`,
          src: p.src.trim(),
          thumb: (p.thumb || p.src || "").trim(),
          download: (p.download || p.src || "").trim(),
          title: (p.title || p.caption || "Event photo").trim(),
          caption: (p.caption || "").trim(),
          fileName: (p.fileName || "").trim(),
          smugmugUrl: (p.smugmugUrl || "").trim(),
        })),
    };
  }

  function fileNameFromPhoto(photo, fallbackIndex = 0) {
    if (photo?.fileName) {
      const base = String(photo.fileName).replace(/[^\w.-]+/g, "-");
      return base.toLowerCase().endsWith(".jpg") ? base : `${base}.jpg`;
    }
    const raw = String(photo?.download || photo?.src || "");
    const last = raw.split("/").pop() || "";
    const cleaned = last.split("?")[0].trim();
    if (cleaned) return cleaned;
    const safeId = String(photo?.id || `photo-${fallbackIndex + 1}`).replace(
      /[^\w.-]+/g,
      "-"
    );
    return `${safeId}.jpg`;
  }

  function absoluteUrl(pathOrUrl) {
    try {
      return new URL(pathOrUrl, window.location.href).href;
    } catch {
      return pathOrUrl;
    }
  }

  function photoDownloadUrl(photo) {
    return absoluteUrl(photo.download || photo.src);
  }

  function photoShareUrl(photo) {
    const key = photo.fileName || photo.id || "";
    const url = new URL(window.location.href);
    url.hash = key ? `photo-${encodeURIComponent(key)}` : "";
    return url.toString();
  }

  /** SmugMug blocks browser CORS; route through an image CDN that allows blob fetch. */
  function corsSafeImageUrl(imageUrl) {
    return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&output=jpg`;
  }

  function saveBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }

  async function fetchBlobFromUrl(url) {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }

  async function fetchPhotoBlob(photo) {
    const direct = photoDownloadUrl(photo);
    try {
      return await fetchBlobFromUrl(direct);
    } catch {
      return fetchBlobFromUrl(corsSafeImageUrl(direct));
    }
  }

  async function downloadPhoto(photo, index = 0) {
    const fileName = fileNameFromPhoto(photo, index);
    const blob = await fetchPhotoBlob(photo);
    const typed =
      blob.type && blob.type.startsWith("image/")
        ? blob
        : new Blob([blob], { type: "image/jpeg" });
    saveBlob(typed, fileName);
  }

  async function sharePhoto(photo) {
    const title = "SAX Business Symposium 2026";
    const text = photo.fileName
      ? `Photo ${photo.fileName} from the SAX Business Symposium`
      : "Photo from the SAX Business Symposium";
    const url = photoShareUrl(photo);

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return "shared";
      } catch (err) {
        if (err?.name === "AbortError") return "cancelled";
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }

    window.prompt("Copy this photo link:", url);
    return "copied";
  }

  function updateSelectionUi() {
    const count = state.selected.size;
    const photoCount = state.photos.length;
    const showSelectActions = state.selectMode && photoCount > 0;
    const allSelected = photoCount > 0 && count === photoCount;

    if (els.selectionCount) {
      els.selectionCount.hidden = !showSelectActions;
      els.selectionCount.textContent = `${count} selected`;
    }
    if (els.selectPhotosBtn) {
      els.selectPhotosBtn.hidden = photoCount === 0;
      els.selectPhotosBtn.classList.toggle("is-active", state.selectMode);
      els.selectPhotosBtn.setAttribute(
        "aria-pressed",
        state.selectMode ? "true" : "false"
      );
      els.selectPhotosBtn.textContent = state.selectMode
        ? "Done selecting"
        : "Select photos";
    }
    if (els.clearSelectionBtn) els.clearSelectionBtn.hidden = !showSelectActions;
    if (els.downloadSelectedBtn) {
      els.downloadSelectedBtn.hidden = !showSelectActions;
      els.downloadSelectedBtn.disabled = count === 0;
      els.downloadSelectedBtn.textContent =
        count > 0 ? `Download selected (${count})` : "Download selected";
    }
    if (els.selectAllToggle) {
      const wrap = els.selectAllToggle.closest("label");
      if (wrap) wrap.hidden = !showSelectActions;
      els.selectAllToggle.checked = allSelected;
      els.selectAllToggle.indeterminate =
        state.selectMode && count > 0 && !allSelected;
      els.selectAllToggle.disabled = photoCount === 0;
    }

    els.grid?.querySelectorAll(".photo-card").forEach((card) => {
      const idx = Number(card.dataset.index);
      const selected = state.selected.has(idx);
      card.classList.toggle("is-selected", selected);
      const checkbox = card.querySelector(".photo-select");
      if (checkbox) checkbox.checked = selected;
    });
  }

  function setSelectMode(enabled, { clearSelection = true } = {}) {
    state.selectMode = Boolean(enabled);
    if (clearSelection) state.selected.clear();
    els.grid?.classList.toggle("is-select-mode", state.selectMode);
    updateSelectionUi();
  }

  function selectAllPhotos() {
    if (!state.photos.length) return;
    state.selectMode = true;
    state.selected = new Set(state.photos.map((_, i) => i));
    els.grid?.classList.toggle("is-select-mode", true);
    updateSelectionUi();
  }

  function clearAllSelections({ keepSelectMode = true } = {}) {
    state.selected.clear();
    if (!keepSelectMode) state.selectMode = false;
    els.grid?.classList.toggle("is-select-mode", state.selectMode);
    updateSelectionUi();
  }

  function togglePhotoSelection(index, forceValue) {
    if (!Number.isFinite(index) || index < 0 || index >= state.photos.length) {
      return;
    }
    const shouldSelect =
      typeof forceValue === "boolean" ? forceValue : !state.selected.has(index);
    if (shouldSelect) state.selected.add(index);
    else state.selected.delete(index);
    if (!state.selectMode) {
      state.selectMode = true;
      els.grid?.classList.toggle("is-select-mode", true);
    }
    updateSelectionUi();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function renderGallery() {
    const hasPhotos = state.photos.length > 0;

    if (!hasPhotos) {
      els.grid.innerHTML = "";
      els.empty.classList.add("visible");
      if (els.toolbar) els.toolbar.hidden = true;
      setSelectMode(false);
      setStatus(
        "is-empty",
        "Photos coming soon — gallery is live and waiting for images"
      );
      return;
    }

    els.empty.classList.remove("visible");
    if (els.toolbar) els.toolbar.hidden = false;

    els.grid.innerHTML = state.photos
      .map((p, i) => {
        const selected = state.selected.has(i);
        const label = p.fileName || p.title || `Photo ${i + 1}`;
        return `
          <article class="photo-card${selected ? " is-selected" : ""}" data-index="${i}">
            <label class="photo-select-wrap" title="Select photo">
              <input
                type="checkbox"
                class="photo-select"
                data-index="${i}"
                aria-label="Select ${escapeAttr(label)}"
                ${selected ? "checked" : ""}
              />
            </label>
            <button
              type="button"
              class="photo-open"
              data-index="${i}"
              aria-label="View ${escapeAttr(label)}"
            >
              <div class="thumb-wrap">
                <img
                  src="${escapeAttr(p.thumb || p.src)}"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </button>
          </article>
        `;
      })
      .join("");

    els.grid.classList.toggle("is-select-mode", state.selectMode);
    updateSelectionUi();
    setStatus("is-live", `${state.photos.length} photos`);
  }

  function openLightbox(index) {
    if (!state.photos.length) return;
    state.lightboxIndex = index;
    const photo = state.photos[index];
    els.lightboxImage.src = photo.src;
    els.lightboxImage.alt = photo.fileName || photo.title || "Event photo";
    els.lightboxCaption.textContent = photo.fileName
      ? `${index + 1} / ${state.photos.length} · ${photo.fileName}`
      : `${index + 1} / ${state.photos.length}`;
    els.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    if (photo.fileName) {
      history.replaceState(
        null,
        "",
        `#photo-${encodeURIComponent(photo.fileName)}`
      );
    }
    els.lightboxClose.focus();
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImage.src = "";
    state.lightboxIndex = -1;
    document.body.style.overflow = "";
    if (location.hash.startsWith("#photo-")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function stepLightbox(delta) {
    if (state.lightboxIndex < 0 || !state.photos.length) return;
    const next =
      (state.lightboxIndex + delta + state.photos.length) % state.photos.length;
    openLightbox(next);
  }

  async function handleDownload(index) {
    const photo = state.photos[index];
    if (!photo) return;
    try {
      if (els.lightboxDownload) els.lightboxDownload.disabled = true;
      setActionStatus("Preparing download…");
      await downloadPhoto(photo, index);
      setActionStatus(`Downloaded ${fileNameFromPhoto(photo, index)}`);
    } catch (err) {
      console.error("Download failed", err);
      setActionStatus("Download failed. Please try again.", true);
    } finally {
      if (els.lightboxDownload) els.lightboxDownload.disabled = false;
    }
  }

  async function handleShare(index) {
    const photo = state.photos[index];
    if (!photo) return;
    try {
      if (els.lightboxShare) els.lightboxShare.disabled = true;
      const result = await sharePhoto(photo);
      if (result === "copied") {
        setActionStatus("Photo link copied to clipboard");
      } else if (result === "shared") {
        setActionStatus("Photo shared");
      }
    } catch (err) {
      console.error("Share failed", err);
      setActionStatus("Share failed. Please try again.", true);
    } finally {
      if (els.lightboxShare) els.lightboxShare.disabled = false;
    }
  }

  async function downloadSelectedPhotos() {
    const indexes = Array.from(state.selected).sort((a, b) => a - b);
    if (!indexes.length) return;

    els.downloadSelectedBtn.disabled = true;
    let success = 0;
    let failed = 0;

    for (let i = 0; i < indexes.length; i += 1) {
      const index = indexes[i];
      const photo = state.photos[index];
      if (!photo) {
        failed += 1;
        continue;
      }
      setActionStatus(
        `Downloading ${i + 1} of ${indexes.length}${
          photo.fileName ? `: ${photo.fileName}` : ""
        }…`
      );
      try {
        await downloadPhoto(photo, index);
        success += 1;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error("Selected download failed", err);
        failed += 1;
      }
    }

    updateSelectionUi();
    if (failed && success) {
      setActionStatus(
        `Downloaded ${success} photo${success === 1 ? "" : "s"}; ${failed} failed.`,
        true
      );
    } else if (failed) {
      setActionStatus("Download failed. Please try again.", true);
    } else {
      setActionStatus(
        `Downloaded ${success} photo${success === 1 ? "" : "s"}`
      );
    }
  }

  function openFromHash() {
    const hash = location.hash || "";
    const match = hash.match(/^#photo-(.+)$/);
    if (!match) return;
    const key = decodeURIComponent(match[1]);
    const idx = state.photos.findIndex(
      (p) => p.fileName === key || p.id === key || p.key === key
    );
    if (idx >= 0) openLightbox(idx);
  }

  els.grid.addEventListener("click", (e) => {
    if (e.target.closest(".photo-select-wrap")) return;

    const openBtn = e.target.closest(".photo-open");
    if (openBtn) {
      const idx = Number(openBtn.dataset.index);
      if (!Number.isFinite(idx)) return;
      if (state.selectMode) {
        togglePhotoSelection(idx);
        return;
      }
      openLightbox(idx);
    }
  });

  els.grid.addEventListener("change", (e) => {
    const checkbox = e.target.closest(".photo-select");
    if (!checkbox) return;
    const idx = Number(checkbox.dataset.index);
    if (!Number.isFinite(idx)) return;
    togglePhotoSelection(idx, checkbox.checked);
  });

  els.selectAllToggle?.addEventListener("change", (e) => {
    if (e.target.checked) selectAllPhotos();
    else clearAllSelections({ keepSelectMode: true });
  });

  els.selectPhotosBtn?.addEventListener("click", () => {
    if (state.selectMode) {
      setSelectMode(false, { clearSelection: true });
      return;
    }
    setSelectMode(true, { clearSelection: true });
  });

  els.clearSelectionBtn?.addEventListener("click", () => {
    clearAllSelections({ keepSelectMode: true });
  });

  els.downloadSelectedBtn?.addEventListener("click", () => {
    downloadSelectedPhotos();
  });

  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightboxPrev.addEventListener("click", () => stepLightbox(-1));
  els.lightboxNext.addEventListener("click", () => stepLightbox(1));
  els.lightboxDownload?.addEventListener("click", () => {
    if (state.lightboxIndex >= 0) handleDownload(state.lightboxIndex);
  });
  els.lightboxShare?.addEventListener("click", () => {
    if (state.lightboxIndex >= 0) handleShare(state.lightboxIndex);
  });
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (els.lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  window.addEventListener("hashchange", () => {
    if (state.photos.length) openFromHash();
  });

  async function loadCatalog() {
    setStatus(null, "Loading gallery…");
    try {
      const res = await fetch(`photos.json?ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`photos.json HTTP ${res.status}`);
      const data = normalizeCatalog(await res.json());
      state.catalog = data;
      state.photos = data.photos;
      state.selected.clear();
      renderGallery();
      openFromHash();
    } catch (err) {
      console.error("Failed to load photo catalog", err);
      state.catalog = normalizeCatalog({ photos: [] });
      state.photos = [];
      state.selected.clear();
      renderGallery();
      setStatus("is-empty", "Photos coming soon");
    }
  }


  // Floating back-to-top control
  const backToTop = document.getElementById("backToTop");
  if (backToTop) {
    const toggleBackToTop = () => {
      const show = window.scrollY > 480;
      backToTop.hidden = false;
      backToTop.classList.toggle("is-visible", show);
      if (!show) {
        // keep in DOM for transition but hide from AT when not needed
        backToTop.setAttribute("aria-hidden", "true");
      } else {
        backToTop.removeAttribute("aria-hidden");
      }
    };
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  loadCatalog();
})();

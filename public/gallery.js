function initGallery({ images, trackId, prevId, nextId, galleryId }) {

  const track = document.getElementById(trackId);
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);
  const gallery = document.getElementById(galleryId);

  if (!track || !prevBtn || !nextBtn || !gallery) return;

  track.innerHTML = "";

  if (!images || images.length === 0) {
    images = ["/img/offer-default.png"];
  }

  let currentIndex = 0;

  images.forEach(src => {
    const slide = document.createElement("div");
    slide.className = "tp-gallery__slide";

    const img = document.createElement("img");
    img.src = src;

    slide.appendChild(img);
    track.appendChild(slide);
  });

  function updatePosition(skipAnimation = false) {
    const width = gallery.offsetWidth;

    if (skipAnimation) {
      track.style.transition = "none";
    } else {
      track.style.transition = "transform 0.35s ease";
    }

    track.style.transform = `translateX(-${currentIndex * width}px)`;

    if (skipAnimation) {
      requestAnimationFrame(() => {
        track.style.transition = "transform 0.35s ease";
      });
    }

    prevBtn.style.display = currentIndex > 0 ? "flex" : "none";
    nextBtn.style.display = currentIndex < images.length - 1 ? "flex" : "none";
  }

  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      updatePosition();
    }
  };

  nextBtn.onclick = () => {
    if (currentIndex < images.length - 1) {
      currentIndex++;
      updatePosition();
    }
  };

  updatePosition(true);

  window.addEventListener("resize", () => updatePosition(true));
}
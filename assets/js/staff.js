document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector(".top-bar input");
  const staffCards = document.querySelectorAll(".staff-card");

  searchInput.addEventListener("keyup", () => {
    const query = searchInput.value.toLowerCase();
    staffCards.forEach(card => {
      card.style.display = card.innerText.toLowerCase().includes(query) ? "block" : "none";
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const yearNode = document.getElementById("year");
  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  const cards = document.querySelectorAll(".workflow-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((item) => item.classList.remove("is-active"));
      card.classList.add("is-active");
    });
  });
});

const STYLE_ID = 'dd-splide-selection-styles';

export function addReviewSelectionStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.review-slider,
.review-slider .review-card,
.review-slider .review-card * {
  -webkit-user-select: none;
  user-select: none;
}

.review-slider .review-card {
  -webkit-user-drag: none;
}
`;

  document.head.appendChild(style);
}

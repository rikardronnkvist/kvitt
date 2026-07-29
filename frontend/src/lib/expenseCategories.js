import {
  Car,
  House,
  Shapes,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';

const CATEGORY_ICONS = {
  shapes: Shapes,
  car: Car,
  'utensils-crossed': UtensilsCrossed,
  wine: Wine,
  house: House,
};

export const CATEGORY_ICON_OPTIONS = [
  { id: 'shapes', label: 'Övrigt' },
  { id: 'car', label: 'Bilresa' },
  { id: 'utensils-crossed', label: 'Mat' },
  { id: 'wine', label: 'Dryck' },
  { id: 'house', label: 'Boende' },
];

export function getCategoryIcon(iconId) {
  return CATEGORY_ICONS[iconId] || Shapes;
}

export function getDefaultCategoryId(categories) {
  if (!categories?.length) return null;
  const explicitDefault = categories.find((category) => category.name === 'Övrigt');
  return explicitDefault?.id ?? categories[0].id;
}

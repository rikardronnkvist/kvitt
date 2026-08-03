import {
  Banknote,
  BanknoteX,
  Beer,
  CableCar,
  Car,
  CarFront,
  Compass,
  CreditCard,
  Hamburger,
  Helicopter,
  House,
  Luggage,
  MapPlus,
  Mountain,
  MountainSnow,
  Plane,
  Ship,
  Shapes,
  Utensils,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';

const CATEGORY_ICONS = {
  shapes: Shapes,
  car: Car,
  'car-front': CarFront,
  compass: Compass,
  hamburger: Hamburger,
  banknote: Banknote,
  'credit-card': CreditCard,
  'map-plus': MapPlus,
  helicopter: Helicopter,
  ship: Ship,
  utensils: Utensils,
  luggage: Luggage,
  'mountain-snow': MountainSnow,
  mountain: Mountain,
  'cable-car': CableCar,
  plane: Plane,
  beer: Beer,
  'utensils-crossed': UtensilsCrossed,
  wine: Wine,
  house: House,
  'banknote-x': BanknoteX,
};

export const CATEGORY_ICON_OPTIONS = [
  { id: 'banknote', label: 'Sedel' },
  { id: 'banknote-x', label: 'Sedel borttagen' },
  { id: 'beer', label: 'Öl' },
  { id: 'cable-car', label: 'Linjebana' },
  { id: 'car', label: 'Bil' },
  { id: 'car-front', label: 'Bil framifrån' },
  { id: 'compass', label: 'Kompass' },
  { id: 'credit-card', label: 'Kort' },
  { id: 'hamburger', label: 'Hamburgare' },
  { id: 'helicopter', label: 'Helikopter' },
  { id: 'house', label: 'Boende' },
  { id: 'luggage', label: 'Bagage' },
  { id: 'map-plus', label: 'Karta plus' },
  { id: 'mountain', label: 'Berg' },
  { id: 'mountain-snow', label: 'Snöberg' },
  { id: 'plane', label: 'Flygplan' },
  { id: 'shapes', label: 'Övrigt' },
  { id: 'ship', label: 'Båt' },
  { id: 'utensils', label: 'Bestick' },
  { id: 'utensils-crossed', label: 'Bestick X' },
  { id: 'wine', label: 'Vin' },
];

export function getCategoryIcon(iconId) {
  const normalizedIconId = String(iconId || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  return CATEGORY_ICONS[normalizedIconId] || Shapes;
}

export function getDefaultCategoryId(categories) {
  if (!categories?.length) return null;
  const explicitDefault = categories.find((category) => category.name === 'Övrigt');
  return explicitDefault?.id ?? categories[0].id;
}

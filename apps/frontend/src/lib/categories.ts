/**
 * Business Category System & Default Experience Tags
 * ReviewAI Frontend
 */

export interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  defaultTags: string[];
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    id: 'gym-fitness',
    name: 'Gym & Fitness',
    slug: 'gym-fitness',
    description: 'Fitness centers, gyms, yoga studios, and personal training facilities',
    defaultTags: [
      'Equipment',
      'Trainer Support',
      'Cleanliness',
      'Workout Environment',
      'Staff Behaviour',
      'Facilities',
      'Membership Experience',
    ],
  },
  {
    id: 'cafe-coffee-shop',
    name: 'Café & Coffee Shop',
    slug: 'cafe-coffee-shop',
    description: 'Coffee houses, bakeries, tea shops, and casual cafes',
    defaultTags: [
      'Coffee Quality',
      'Taste',
      'Ambience',
      'Staff Behaviour',
      'Cleanliness',
      'Service',
      'Seating',
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    slug: 'restaurant',
    description: 'Fine dining, casual eateries, family diners, and bistros',
    defaultTags: [
      'Food Quality',
      'Taste',
      'Service',
      'Ambience',
      'Cleanliness',
      'Waiting Time',
    ],
  },
  {
    id: 'hospital-healthcare',
    name: 'Hospital & Healthcare',
    slug: 'hospital-healthcare',
    description: 'Clinics, hospitals, diagnostic centers, and medical care providers',
    defaultTags: [
      'Staff Behaviour',
      'Cleanliness',
      'Waiting Time',
      'Communication',
      'Facilities',
      'Appointment Experience',
    ],
  },
  {
    id: 'dental-clinic',
    name: 'Dental Clinic',
    slug: 'dental-clinic',
    description: 'Dental care centers, orthodontics, and cosmetic dental practices',
    defaultTags: [
      'Consultation',
      'Gentle Care',
      'Cleanliness',
      'Staff Behaviour',
      'Treatment Quality',
      'Waiting Time',
    ],
  },
  {
    id: 'salon-beauty',
    name: 'Salon & Beauty',
    slug: 'salon-beauty',
    description: 'Hair salons, spas, grooming lounges, and aesthetic centers',
    defaultTags: [
      'Haircut',
      'Styling',
      'Staff Behaviour',
      'Hygiene',
      'Service Quality',
      'Ambience',
    ],
  },
  {
    id: 'hotel-hospitality',
    name: 'Hotel & Hospitality',
    slug: 'hotel-hospitality',
    description: 'Hotels, resorts, guesthouses, and hospitality stays',
    defaultTags: [
      'Room Cleanliness',
      'Comfort',
      'Staff Behaviour',
      'Check-in Experience',
      'Food & Dining',
      'Amenities',
      'Location',
    ],
  },
  {
    id: 'retail-store',
    name: 'Retail Store',
    slug: 'retail-store',
    description: 'Clothing boutiques, supermarkets, electronics, and general retail',
    defaultTags: [
      'Product Variety',
      'Pricing',
      'Staff Behaviour',
      'Store Ambience',
      'Checkout Speed',
      'Product Quality',
    ],
  },
  {
    id: 'automobile-service',
    name: 'Automobile Service',
    slug: 'automobile-service',
    description: 'Auto repair shops, car care centers, dealerships, and bike service',
    defaultTags: [
      'Service Quality',
      'Timely Delivery',
      'Transparent Pricing',
      'Staff Behaviour',
      'Workmanship',
      'Waiting Lounge',
    ],
  },
  {
    id: 'education-coaching',
    name: 'Education & Coaching',
    slug: 'education-coaching',
    description: 'Coaching institutes, academies, tutoring centers, and schools',
    defaultTags: [
      'Faculty Quality',
      'Concept Clarity',
      'Study Material',
      'Doubt Resolution',
      'Environment',
      'Mentorship',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    slug: 'other',
    description: 'Professional services and other local businesses',
    defaultTags: [
      'Customer Service',
      'Quality',
      'Timeliness',
      'Staff Behaviour',
      'Cleanliness',
      'Value for Money',
    ],
  },
];

export function getBusinessCategories(): BusinessCategory[] {
  return BUSINESS_CATEGORIES;
}

export function getCategoryById(idOrSlug?: string | null): BusinessCategory {
  if (!idOrSlug) return BUSINESS_CATEGORIES.find(c => c.id === 'other')!;
  const normalized = idOrSlug.toLowerCase().trim().replace(/\s+/g, '-');
  return (
    BUSINESS_CATEGORIES.find(c => c.id === normalized || c.slug === normalized) ||
    BUSINESS_CATEGORIES.find(c => c.name.toLowerCase() === idOrSlug.toLowerCase().trim()) ||
    BUSINESS_CATEGORIES.find(c => c.id === 'other')!
  );
}

export function getDefaultTagsForCategory(idOrSlug?: string | null): string[] {
  const cat = getCategoryById(idOrSlug);
  return cat.defaultTags;
}

export function getCategoryExperienceTags(idOrSlug?: string | null) {
  const tags = getDefaultTagsForCategory(idOrSlug);
  const emojis = ['⭐', '✨', '👍', '🎯', '💫', '🔥', '👏', '🌟'];
  return tags.map((label, idx) => ({
    id: `cat-tag-${idx + 1}`,
    label,
    emoji: emojis[idx % emojis.length],
    order: idx,
  }));
}

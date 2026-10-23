// Common foods available to everyone, so staples don't need a database search.
// Values are per 100 g, rounded averages of public-domain USDA reference data
// (FoodData Central / SR Legacy). Keys are permanent: diary entries point at
// these rows, so change values freely but never reuse or rename a key.
//
// Columns: key, name, kcal, protein, carbs, fat, fiber, sugar, sodium (mg),
// then named portions in grams.

export interface BuiltinFood {
  key: string;
  name: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number };
  portions: { label: string; grams: number }[];
}

type Row = [key: string, name: string, kcal: number, protein: number, carbs: number, fat: number, fiber: number, sugar: number, sodium: number, portions?: Record<string, number>];

const rows: Row[] = [
  // Eggs and dairy
  ['egg', 'Egg, whole', 143, 12.6, 0.7, 9.5, 0, 0.4, 142, { '1 large': 50, '1 medium': 44 }],
  ['egg-white', 'Egg white', 52, 10.9, 0.7, 0.2, 0, 0.7, 166, { '1 large white': 33 }],
  ['milk-whole', 'Milk, whole (3.25%)', 61, 3.2, 4.8, 3.3, 0, 5.1, 43, { '1 cup': 244 }],
  ['milk-2', 'Milk, 2%', 50, 3.3, 4.8, 2.0, 0, 5.1, 47, { '1 cup': 244 }],
  ['milk-skim', 'Milk, skim', 34, 3.4, 5.0, 0.1, 0, 5.1, 42, { '1 cup': 245 }],
  ['almond-milk', 'Almond milk, unsweetened', 15, 0.6, 0.6, 1.1, 0.2, 0, 72, { '1 cup': 240 }],
  ['greek-yogurt-nonfat', 'Greek yogurt, plain, nonfat', 59, 10.2, 3.6, 0.4, 0, 3.2, 36, { '1 container': 170, '1 cup': 227 }],
  ['greek-yogurt-whole', 'Greek yogurt, plain, whole milk', 97, 9.0, 4.0, 5.0, 0, 4.0, 35, { '1 cup': 227 }],
  ['cottage-cheese-2', 'Cottage cheese, 2%', 81, 10.5, 4.8, 2.3, 0, 4.0, 308, { '½ cup': 113 }],
  ['cheddar', 'Cheddar cheese', 403, 24.9, 1.3, 33.1, 0, 0.5, 621, { '1 slice': 28, '¼ cup shredded': 28 }],
  ['mozzarella-part-skim', 'Mozzarella, part-skim', 254, 24.3, 2.8, 15.9, 0, 1.1, 619, { '1 oz': 28 }],
  ['parmesan', 'Parmesan cheese', 392, 35.8, 3.2, 25.8, 0, 0.8, 1602, { '1 tbsp grated': 5 }],
  ['cream-cheese', 'Cream cheese', 342, 5.9, 4.1, 34.2, 0, 3.2, 321, { '1 tbsp': 15 }],
  ['butter', 'Butter, salted', 717, 0.9, 0.1, 81.1, 0, 0.1, 643, { '1 tbsp': 14, '1 pat': 5 }],
  ['heavy-cream', 'Heavy cream', 340, 2.8, 2.7, 36.1, 0, 2.9, 27, { '1 tbsp': 15 }],
  ['ice-cream-vanilla', 'Ice cream, vanilla', 207, 3.5, 23.6, 11.0, 0.7, 21.2, 80, { '½ cup': 66 }],

  // Meat, fish and other protein
  ['chicken-breast-cooked', 'Chicken breast, skinless, cooked', 165, 31.0, 0, 3.6, 0, 0, 74, { '1 breast half': 172 }],
  ['chicken-breast-raw', 'Chicken breast, skinless, raw', 120, 22.5, 0, 2.6, 0, 0, 45],
  ['chicken-thigh-cooked', 'Chicken thigh, skinless, cooked', 209, 25.9, 0, 10.9, 0, 0, 88],
  ['ground-beef-85-cooked', 'Ground beef 85/15, cooked', 250, 25.9, 0, 15.6, 0, 0, 82, { '1 patty (¼ lb raw)': 85 }],
  ['ground-beef-90-cooked', 'Ground beef 90/10, cooked', 217, 26.1, 0, 11.7, 0, 0, 76, { '1 patty (¼ lb raw)': 85 }],
  ['ground-beef-85-raw', 'Ground beef 85/15, raw', 215, 18.6, 0, 15.0, 0, 0, 66],
  ['ground-turkey-cooked', 'Ground turkey, cooked', 203, 27.4, 0, 10.4, 0, 0, 78],
  ['sirloin-cooked', 'Beef sirloin steak, lean, cooked', 199, 30.5, 0, 7.7, 0, 0, 64],
  ['pork-tenderloin-cooked', 'Pork tenderloin, cooked', 143, 26.2, 0, 3.5, 0, 0, 57],
  ['bacon-cooked', 'Bacon, cooked', 541, 37.0, 1.4, 42.0, 0, 0, 1717, { '1 slice': 8 }],
  ['salmon-cooked', 'Salmon, Atlantic, cooked', 206, 22.1, 0, 12.4, 0, 0, 61],
  ['salmon-raw', 'Salmon, Atlantic, raw', 208, 20.4, 0, 13.4, 0, 0, 59],
  ['tuna-canned-water', 'Tuna, light, canned in water, drained', 116, 25.5, 0, 0.8, 0, 0, 338, { '1 can, drained': 115 }],
  ['shrimp-cooked', 'Shrimp, cooked', 99, 24.0, 0.2, 0.3, 0, 0, 111],
  ['tilapia-cooked', 'Tilapia, cooked', 128, 26.2, 0, 2.7, 0, 0, 56],
  ['tofu-firm', 'Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, 0.6, 14, { '½ cup': 126 }],

  // Beans, nuts and seeds
  ['black-beans-cooked', 'Black beans, cooked', 132, 8.9, 23.7, 0.5, 8.7, 0.3, 1, { '½ cup': 86, '1 cup': 172 }],
  ['chickpeas-cooked', 'Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 7, { '½ cup': 82, '1 cup': 164 }],
  ['lentils-cooked', 'Lentils, cooked', 116, 9.0, 20.1, 0.4, 7.9, 1.8, 2, { '½ cup': 99, '1 cup': 198 }],
  ['kidney-beans-cooked', 'Kidney beans, cooked', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 2, { '½ cup': 89, '1 cup': 177 }],
  ['edamame', 'Edamame, shelled, cooked', 121, 11.9, 8.9, 5.2, 5.2, 2.2, 6, { '1 cup': 155 }],
  ['hummus', 'Hummus', 166, 7.9, 14.3, 9.6, 6.0, 0.3, 379, { '2 tbsp': 30 }],
  ['peanut-butter', 'Peanut butter, smooth', 588, 25.1, 19.6, 50.4, 6.0, 9.2, 459, { '1 tbsp': 16, '2 tbsp': 32 }],
  ['almonds', 'Almonds', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, { '1 oz (23 nuts)': 28 }],
  ['walnuts', 'Walnuts', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 2, { '1 oz': 28 }],
  ['cashews', 'Cashews', 553, 18.2, 30.2, 43.8, 3.3, 5.9, 12, { '1 oz': 28 }],
  ['peanuts', 'Peanuts, dry roasted', 585, 23.7, 21.5, 49.7, 8.0, 4.2, 6, { '1 oz': 28 }],
  ['chia-seeds', 'Chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 0, 16, { '1 tbsp': 12 }],

  // Grains and starches
  ['white-rice-cooked', 'White rice, cooked', 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, { '1 cup': 158, '½ cup': 79 }],
  ['brown-rice-cooked', 'Brown rice, cooked', 123, 2.7, 25.6, 1.0, 1.6, 0.2, 4, { '1 cup': 195 }],
  ['pasta-cooked', 'Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, 0.6, 1, { '1 cup': 140 }],
  ['pasta-dry', 'Pasta, dry', 371, 13.0, 74.7, 1.5, 3.2, 2.7, 6, { '2 oz': 56 }],
  ['oats', 'Oats, rolled, dry', 379, 13.2, 67.7, 6.5, 10.1, 1.0, 6, { '½ cup': 40 }],
  ['quinoa-cooked', 'Quinoa, cooked', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, { '1 cup': 185 }],
  ['bread-white', 'Bread, white', 266, 7.6, 50.6, 3.3, 2.4, 5.3, 490, { '1 slice': 28 }],
  ['bread-whole-wheat', 'Bread, whole wheat', 252, 12.4, 42.7, 3.5, 6.0, 4.4, 450, { '1 slice': 32 }],
  ['bagel', 'Bagel, plain', 257, 10.0, 50.5, 1.6, 2.2, 5.0, 430, { '1 medium': 105 }],
  ['tortilla-flour', 'Tortilla, flour', 312, 8.3, 51.6, 8.0, 3.5, 3.6, 589, { '1 medium (8 in)': 45 }],
  ['tortilla-corn', 'Tortilla, corn', 218, 5.7, 44.6, 2.9, 6.3, 0.9, 45, { '1 tortilla': 26 }],
  ['potato-baked', 'Potato, baked, with skin', 93, 2.5, 21.2, 0.1, 2.2, 1.2, 10, { '1 medium': 173 }],
  ['sweet-potato-baked', 'Sweet potato, baked, with skin', 90, 2.0, 20.7, 0.2, 3.3, 6.5, 36, { '1 medium': 114 }],
  ['corn-cooked', 'Sweet corn, cooked', 96, 3.4, 21.0, 1.5, 2.4, 4.5, 1, { '½ cup': 82 }],
  ['popcorn-air', 'Popcorn, air-popped', 387, 12.9, 77.8, 4.5, 14.5, 0.9, 8, { '1 cup': 8 }],

  // Fruit
  ['apple', 'Apple', 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, { '1 medium': 182 }],
  ['banana', 'Banana', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, { '1 medium': 118, '1 large': 136 }],
  ['orange', 'Orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, { '1 medium': 131 }],
  ['strawberries', 'Strawberries', 32, 0.7, 7.7, 0.3, 2.0, 4.9, 1, { '1 cup halves': 152 }],
  ['blueberries', 'Blueberries', 57, 0.7, 14.5, 0.3, 2.4, 10.0, 1, { '1 cup': 148 }],
  ['raspberries', 'Raspberries', 52, 1.2, 11.9, 0.7, 6.5, 4.4, 1, { '1 cup': 123 }],
  ['grapes', 'Grapes', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2, { '1 cup': 151 }],
  ['avocado', 'Avocado', 160, 2.0, 8.5, 14.7, 6.7, 0.7, 7, { '½ avocado': 68 }],
  ['pineapple', 'Pineapple', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 1, { '1 cup chunks': 165 }],
  ['mango', 'Mango', 60, 0.8, 15.0, 0.4, 1.6, 13.7, 1, { '1 cup pieces': 165 }],
  ['watermelon', 'Watermelon', 30, 0.6, 7.6, 0.2, 0.4, 6.2, 1, { '1 cup diced': 152 }],
  ['pear', 'Pear', 57, 0.4, 15.2, 0.1, 3.1, 9.8, 1, { '1 medium': 178 }],
  ['peach', 'Peach', 39, 0.9, 9.5, 0.3, 1.5, 8.4, 0, { '1 medium': 150 }],
  ['raisins', 'Raisins', 299, 3.1, 79.2, 0.5, 3.7, 59.2, 11, { '¼ cup': 36 }],
  ['dates-medjool', 'Dates, Medjool', 277, 1.8, 75.0, 0.2, 6.7, 66.5, 1, { '1 date': 24 }],

  // Vegetables
  ['broccoli-raw', 'Broccoli, raw', 34, 2.8, 6.6, 0.4, 2.6, 1.7, 33, { '1 cup chopped': 91 }],
  ['broccoli-cooked', 'Broccoli, cooked', 35, 2.4, 7.2, 0.4, 3.3, 1.4, 41, { '1 cup': 156 }],
  ['spinach-raw', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, { '1 cup': 30 }],
  ['kale-raw', 'Kale, raw', 35, 2.9, 4.4, 1.5, 4.1, 1.0, 53, { '1 cup chopped': 21 }],
  ['romaine', 'Lettuce, romaine', 17, 1.2, 3.3, 0.3, 2.1, 1.2, 8, { '1 cup shredded': 47 }],
  ['carrot', 'Carrot, raw', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 69, { '1 medium': 61 }],
  ['tomato', 'Tomato', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 5, { '1 medium': 123 }],
  ['cucumber', 'Cucumber, with peel', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 2, { '1 cup sliced': 104 }],
  ['bell-pepper-red', 'Bell pepper, red', 31, 1.0, 6.0, 0.3, 2.1, 4.2, 4, { '1 medium': 119 }],
  ['onion', 'Onion', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, { '1 medium': 110 }],
  ['mushrooms', 'Mushrooms, white', 22, 3.1, 3.3, 0.3, 1.0, 2.0, 5, { '1 cup sliced': 70 }],
  ['green-beans-cooked', 'Green beans, cooked', 35, 1.9, 7.9, 0.3, 3.2, 1.6, 1, { '1 cup': 125 }],
  ['zucchini', 'Zucchini', 17, 1.2, 3.1, 0.3, 1.0, 2.5, 8, { '1 medium': 196 }],
  ['cauliflower', 'Cauliflower, raw', 25, 1.9, 5.0, 0.3, 2.0, 1.9, 30, { '1 cup': 107 }],
  ['peas-cooked', 'Green peas, cooked', 84, 5.4, 15.6, 0.2, 5.5, 5.9, 3, { '1 cup': 160 }],
  ['asparagus-cooked', 'Asparagus, cooked', 22, 2.4, 4.1, 0.2, 2.0, 1.3, 14],
  ['brussels-sprouts-cooked', 'Brussels sprouts, cooked', 36, 2.6, 7.1, 0.5, 2.6, 1.7, 21],

  // Fats, sweets, condiments and drinks
  ['olive-oil', 'Olive oil', 884, 0, 0, 100, 0, 0, 2, { '1 tbsp': 13.5, '1 tsp': 4.5 }],
  ['vegetable-oil', 'Vegetable oil', 884, 0, 0, 100, 0, 0, 0, { '1 tbsp': 14 }],
  ['mayonnaise', 'Mayonnaise', 680, 1.0, 0.6, 74.9, 0, 0.6, 635, { '1 tbsp': 14 }],
  ['sugar', 'Sugar, white', 387, 0, 100, 0, 0, 100, 1, { '1 tsp': 4, '1 tbsp': 12.5 }],
  ['honey', 'Honey', 304, 0.3, 82.4, 0, 0.2, 82.1, 4, { '1 tbsp': 21 }],
  ['maple-syrup', 'Maple syrup', 260, 0, 67.0, 0.1, 0, 60.5, 12, { '1 tbsp': 20 }],
  ['dark-chocolate', 'Dark chocolate, 70–85%', 598, 7.8, 45.9, 42.6, 10.9, 24.0, 20, { '1 oz': 28 }],
  ['ketchup', 'Ketchup', 101, 1.0, 27.4, 0.1, 0.3, 21.3, 907, { '1 tbsp': 17 }],
  ['soy-sauce', 'Soy sauce', 53, 8.1, 4.9, 0.6, 0.8, 0.4, 5493, { '1 tbsp': 16 }],
  ['salt', 'Salt, table', 0, 0, 0, 0, 0, 0, 38758, { '1 tsp': 6, '¼ tsp': 1.5 }],
  ['orange-juice', 'Orange juice', 45, 0.7, 10.4, 0.2, 0.2, 8.4, 1, { '1 cup': 248 }],
  ['cola', 'Cola, regular', 42, 0, 10.6, 0, 0, 10.6, 4, { '1 can (12 fl oz)': 368 }],
  ['coffee-black', 'Coffee, black', 1, 0.1, 0, 0, 0, 0, 2, { '1 cup': 240 }],
  ['cola-zero', 'Cola, zero sugar', 1, 0, 0.1, 0, 0, 0, 12, { '1 can (12 fl oz)': 355 }],
  ['sparkling-water', 'Sparkling water, unflavored', 0, 0, 0, 0, 0, 0, 2, { '1 can (12 fl oz)': 355 }],
  ['iced-tea-unsweetened', 'Iced tea, unsweetened', 1, 0, 0.3, 0, 0, 0, 3, { '1 bottle (16 fl oz)': 473 }],
  ['sweet-tea', 'Iced tea, sweetened', 34, 0, 8.6, 0, 0, 8.5, 3, { '1 bottle (16 fl oz)': 473 }],
  ['energy-drink', 'Energy drink, regular', 45, 0.3, 11, 0, 0, 11, 40, { '1 can (16 fl oz)': 473 }],
  ['energy-drink-zero', 'Energy drink, sugar free', 2, 0.3, 0.3, 0, 0, 0, 40, { '1 can (16 fl oz)': 473 }],
];

export const builtinFoods: BuiltinFood[] = rows.map(([key, name, kcal, protein, carbs, fat, fiber, sugar, sodium, portions]) => ({
  key,
  name,
  per100: { kcal, protein, carbs, fat, fiber, sugar, sodium },
  portions: Object.entries(portions ?? {}).map(([label, grams]) => ({ label, grams })),
}));

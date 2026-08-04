import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, 'data', 'kvitt.db');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const GROUP_ID = 2;
const NUM_EXPENSES = 35;
const NUM_PAYMENTS = 15;

// Get group members
const members = db.prepare(`
  SELECT u.id, u.full_name FROM users u
  JOIN group_members gm ON gm.user_id = u.id
  WHERE gm.group_id = ?
`).all(GROUP_ID);

if (members.length < 2) {
  console.error('Group 2 must have at least 2 members');
  process.exit(1);
}

console.log(`Found ${members.length} members in group ${GROUP_ID}:`, members.map((m) => m.full_name || `Användare ${m.id}`).join(', '));

// Generate dates over the last 3 months
function getRandomDateInPast3Months() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return new Date(threeMonthsAgo.getTime() + Math.random() * (now.getTime() - threeMonthsAgo.getTime()));
}

function getRandomMember() {
  return members[Math.floor(Math.random() * members.length)];
}

function getOtherMember(memberId) {
  const others = members.filter(m => m.id !== memberId);
  return others[Math.floor(Math.random() * others.length)];
}

// Expense titles
const expenseTitles = [
  'Lunch', 'Dinner', 'Groceries', 'Taxi', 'Drinks', 'Movie tickets',
  'Gas', 'Coffee', 'Pizza', 'Restaurant', 'Dessert', 'Snacks',
  'Breakfast', 'Ice cream', 'Beer', 'Wine', 'Cocktails', 'Brunch',
  'Parking', 'Tolls', 'Museum', 'Concert', 'Theatre', 'Games',
  'Books', 'Supplies', 'Snack run', 'Late night food', 'Desserts'
];

// Generate expenses
console.log(`\nAdding ${NUM_EXPENSES} expenses...`);
const insertExpense = db.prepare(`
  INSERT INTO expenses (group_id, title, amount, currency, paid_by_user_id, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertSplit = db.prepare(`
  INSERT INTO expense_splits (expense_id, user_id, amount_owed)
  VALUES (?, ?, ?)
`);

for (let i = 0; i < NUM_EXPENSES; i++) {
  const payer = getRandomMember();
  const amount = Math.round((Math.random() * 400 + 50) * 100) / 100; // 50-450 SEK
  const selectedMembers = [];
  
  // Randomly select 2-4 members to split
  const numSplits = Math.floor(Math.random() * 3) + 2;
  const memberIds = new Set();
  memberIds.add(payer.id);
  
  while (memberIds.size < numSplits && memberIds.size < members.length) {
    memberIds.add(getRandomMember().id);
  }
  
  const splitMembers = Array.from(memberIds).map(id => members.find(m => m.id === id));
  
  const title = expenseTitles[Math.floor(Math.random() * expenseTitles.length)];
  const date = getRandomDateInPast3Months();
  
  try {
    const result = insertExpense.run(
      GROUP_ID,
      title,
      amount,
      'SEK',
      payer.id,
      null,
      date.toISOString()
    );
    
    // Calculate equal split
    const amountPerPerson = Math.round((amount / splitMembers.length) * 100) / 100;
    let remainder = Math.round(amount * 100) - Math.round(amountPerPerson * 100) * splitMembers.length;
    
    for (let j = 0; j < splitMembers.length; j++) {
      const splitAmount = amountPerPerson + (remainder > 0 ? 0.01 : 0);
      remainder -= (remainder > 0 ? 1 : 0);
      insertSplit.run(result.lastInsertRowid, splitMembers[j].id, splitAmount);
    }
  } catch (e) {
    console.error('Error inserting expense:', e.message);
  }
}

// Generate payments
console.log(`Adding ${NUM_PAYMENTS} payments...`);
const insertSettlement = db.prepare(`
  INSERT INTO settlements (group_id, payer_id, receiver_id, amount, settled_at)
  VALUES (?, ?, ?, ?, ?)
`);

for (let i = 0; i < NUM_PAYMENTS; i++) {
  const payer = getRandomMember();
  const receiver = getOtherMember(payer.id);
  const amount = Math.round((Math.random() * 300 + 20) * 100) / 100; // 20-320 SEK
  const date = getRandomDateInPast3Months();
  
  try {
    insertSettlement.run(
      GROUP_ID,
      payer.id,
      receiver.id,
      amount,
      date.toISOString()
    );
  } catch (e) {
    console.error('Error inserting settlement:', e.message);
  }
}

console.log(`\n✓ Successfully added ${NUM_EXPENSES} expenses and ${NUM_PAYMENTS} payments to group ${GROUP_ID}`);
db.close();

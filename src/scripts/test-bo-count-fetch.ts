/**
 * Test BO Count Fetch from Firestore
 *
 * Verifies we can access status_other.bo_count field from Firestore prod account
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { existsSync } from 'fs';

// Initialize Firebase Admin SDK
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.VITE_GOOGLE_PRIVATE_KEY;

  console.log('🔐 Firebase Auth Configuration:');
  console.log(`   Project ID: ${projectId || '(not set)'}`);
  console.log(`   Service Account: ${clientEmail || '(not set)'}`);
  console.log(`   Key File: ${keyPath || '(not set)'}`);
  console.log('');

  if (keyPath && existsSync(keyPath)) {
    console.log('✅ Using service account key file (GOOGLE_APPLICATION_CREDENTIALS)');
    admin.initializeApp({
      credential: admin.credential.cert(keyPath),
      projectId,
    });
  } else if (projectId && clientEmail && privateKey) {
    console.log('✅ Using environment variables (VITE_GOOGLE_*)');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    throw new Error('❌ Missing Firebase credentials. Set either GOOGLE_APPLICATION_CREDENTIALS or VITE_GOOGLE_* env vars');
  }

  return admin.apps[0]!;
}

export async function testBoCountFetch() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Test BO Count Fetch from Firestore           ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    // Initialize Firebase
    const app = initializeFirebaseAdmin();
    const db = app.firestore();
    const collection = process.env.VITE_FIRESTORE_COLLECTION || 'medical_pa_orders';

    console.log(`📚 Collection: ${collection}\n`);

    // Test 1: Fetch a recent order by date range
    console.log('═══════════════════════════════════════════════════════');
    console.log('TEST 1: Fetch recent orders by date range');
    console.log('═══════════════════════════════════════════════════════\n');

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const endDateStr = `${dateStr}T23:59:59`;

    console.log(`📅 Querying orders for: ${dateStr}`);
    console.log(`   Facility: HhwIHO4npKhrxyylkC33 (NYCBS)\n`);

    const query = db
      .collection(collection)
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .where('timestamps.created_at', '>=', dateStr)
      .where('timestamps.created_at', '<=', endDateStr)
      .limit(10); // Limit to 10 for testing

    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log('⚠️  No orders found for today. Try adjusting the date.');
      return;
    }

    console.log(`✅ Found ${snapshot.size} orders\n`);

    // Test 2: Check status_other.bo_count field
    console.log('═══════════════════════════════════════════════════════');
    console.log('TEST 2: Check status_other.bo_count field');
    console.log('═══════════════════════════════════════════════════════\n');

    let ordersWithBoCount = 0;
    let ordersWithoutBoCount = 0;
    const boCountValues: number[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const orderId = doc.id;
      const authOnFile = data?.auth_on_file;
      const boCount = authOnFile?.bo_count;

      if (boCount !== undefined && boCount !== null) {
        ordersWithBoCount++;
        boCountValues.push(boCount);
        console.log(`✅ Order ${orderId.substring(0, 8)}... has bo_count: ${boCount}`);
      } else {
        ordersWithoutBoCount++;
        console.log(`❌ Order ${orderId.substring(0, 8)}... missing bo_count (auth_on_file: ${authOnFile ? 'exists' : 'undefined'})`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`📊 Orders checked: ${snapshot.size}`);
    console.log(`   ✅ With bo_count: ${ordersWithBoCount}`);
    console.log(`   ❌ Without bo_count: ${ordersWithoutBoCount}`);

    if (boCountValues.length > 0) {
      console.log(`\n📈 bo_count statistics:`);
      console.log(`   Min: ${Math.min(...boCountValues)}`);
      console.log(`   Max: ${Math.max(...boCountValues)}`);
      console.log(`   Avg: ${(boCountValues.reduce((a, b) => a + b, 0) / boCountValues.length).toFixed(2)}`);
      console.log(`   Values: [${boCountValues.join(', ')}]`);
    }

    // Test 3: Fetch specific order by ID
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('TEST 3: Fetch specific order by ID');
    console.log('═══════════════════════════════════════════════════════\n');

    const firstDoc = snapshot.docs[0];
    const testOrderId = firstDoc.id;
    console.log(`🔍 Testing direct fetch for order: ${testOrderId}\n`);

    const docSnapshot = await db.collection(collection).doc(testOrderId).get();

    if (!docSnapshot.exists) {
      console.log('❌ Order not found');
      return;
    }

    const orderData = docSnapshot.data();
    const authOnFileField = orderData?.auth_on_file;

    console.log('📄 Order Document Structure:');
    console.log(`   Order ID: ${testOrderId}`);
    console.log(`   created_at: ${orderData?.timestamps?.created_at}`);
    console.log(`   facility_id: ${orderData?.assigned_to?.facility_id}`);
    console.log(`\n🔍 auth_on_file field:`, JSON.stringify(authOnFileField, null, 2));

    if (authOnFileField?.bo_count !== undefined) {
      console.log(`\n✅ SUCCESS: bo_count value = ${authOnFileField.bo_count}`);
    } else {
      console.log(`\n⚠️  WARNING: auth_on_file.bo_count field not found or is null`);
      console.log('   Check if field exists in Firestore or if field name is different');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error during test:', error);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
  }
}

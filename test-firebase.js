const admin = require('firebase-admin');
require('dotenv').config();

async function testFirebase() {
  try {
    console.log('1. Initializing Firebase...');
    const privateKey = process.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      throw new Error('Missing Firebase credentials');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });

    const db = admin.firestore();
    console.log('✓ Firebase initialized');

    // Test 1: Simple collection access
    console.log('\n2. Testing collection access...');
    const collectionRef = db.collection('medical_pa_orders');
    console.log('✓ Collection reference created');

    // Test 2: Count documents (very simple query)
    console.log('\n3. Testing simple count query (limit 1)...');
    const startTime = Date.now();
    const snapshot = await collectionRef.limit(1).get();
    const elapsed = Date.now() - startTime;
    console.log(`✓ Simple query completed in ${elapsed}ms`);
    console.log(`   Found ${snapshot.size} document(s)`);

    // Test 3: Query with single where clause
    console.log('\n4. Testing single where clause...');
    const startTime2 = Date.now();
    const snapshot2 = await collectionRef
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .limit(5)
      .get();
    const elapsed2 = Date.now() - startTime2;
    console.log(`✓ Single where query completed in ${elapsed2}ms`);
    console.log(`   Found ${snapshot2.size} document(s)`);

    // Test 4: The problematic compound query
    console.log('\n5. Testing compound where clause (THE PROBLEM)...');
    console.log('   This is where it likely hangs...');
    const startTime3 = Date.now();

    // Set a manual timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
    );

    const queryPromise = collectionRef
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .where('auth_on_file.created_at', '>=', '2026-01-05')
      .where('auth_on_file.created_at', '<=', '2026-01-05T23:59:59')
      .limit(5)
      .get();

    const snapshot3 = await Promise.race([queryPromise, timeoutPromise]);
    const elapsed3 = Date.now() - startTime3;
    console.log(`✓ Compound where query completed in ${elapsed3}ms`);
    console.log(`   Found ${snapshot3.size} document(s)`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('index')) {
      console.error('\n💡 This is likely a MISSING COMPOSITE INDEX issue!');
      console.error('   You need to create an index in Firebase Console:');
      console.error('   Collection: medical_pa_orders');
      console.error('   Fields: assigned_to.facility_id (Ascending) + auth_on_file.created_at (Ascending)');
    }
  } finally {
    process.exit(0);
  }
}

testFirebase();

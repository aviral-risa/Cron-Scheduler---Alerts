import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

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
    console.log('\n4. Testing single where clause (facility_id)...');
    const startTime2 = Date.now();
    const snapshot2 = await collectionRef
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .limit(5)
      .get();
    const elapsed2 = Date.now() - startTime2;
    console.log(`✓ Single where query completed in ${elapsed2}ms`);
    console.log(`   Found ${snapshot2.size} document(s)`);

    // Test 4: The problematic compound query with limit(5)
    console.log('\n5. Testing compound where clause with limit(5)...');
    console.log('   Query: facility_id + auth_on_file.created_at');
    console.log('   This requires a composite index to work efficiently...');
    const startTime3 = Date.now();

    // Set a manual timeout
    const timeoutPromise3 = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
    );

    const queryPromise3 = collectionRef
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .where('auth_on_file.created_at', '>=', '2026-01-05')
      .where('auth_on_file.created_at', '<=', '2026-01-05T23:59:59')
      .limit(5)
      .get();

    const snapshot3 = await Promise.race([queryPromise3, timeoutPromise3]);
    const elapsed3 = Date.now() - startTime3;
    console.log(`✓ Query completed in ${elapsed3}ms`);
    console.log(`   Found ${snapshot3.size} document(s)`);

    // Test 5: Same query with limit(500) - THE REAL TEST
    console.log('\n6. Testing compound where clause with limit(500) - THE CRITICAL TEST...');
    console.log('   This is what the sync code does...');
    const startTime4 = Date.now();

    const timeoutPromise4 = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout after 60 seconds')), 60000)
    );

    const queryPromise4 = collectionRef
      .where('assigned_to.facility_id', '==', 'HhwIHO4npKhrxyylkC33')
      .where('auth_on_file.created_at', '>=', '2026-01-08')
      .where('auth_on_file.created_at', '<=', '2026-01-08T23:59:59')
      .limit(500)
      .get();

    const snapshot4 = await Promise.race([queryPromise4, timeoutPromise4]);
    const elapsed4 = Date.now() - startTime4;
    console.log(`✓ Query completed in ${elapsed4}ms`);
    console.log(`   Found ${snapshot4.size} document(s)`);

    console.log('\n✅ All tests passed! Firebase is working correctly.');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);

    if (error.message.includes('timeout') || error.message.includes('Query timeout')) {
      console.error('\n🔍 DIAGNOSIS: MISSING OR BROKEN COMPOSITE INDEX');
      console.error('━'.repeat(60));
      console.error('The compound query is hanging/timing out.');
      console.error('This means Firebase Firestore cannot find a suitable index.');
      console.error('');
      console.error('SOLUTION: Create a composite index in Firebase Console');
      console.error('');
      console.error('Index Configuration:');
      console.error('  Collection:    medical_pa_orders');
      console.error('  Field 1:       assigned_to.facility_id  (Ascending)');
      console.error('  Field 2:       auth_on_file.created_at  (Ascending)');
      console.error('');
      console.error('Steps:');
      console.error('  1. Go to Firebase Console → Firestore → Indexes');
      console.error('  2. Create a composite index with the fields above');
      console.error('  3. Wait for index to build (can take minutes)');
      console.error('  4. Try sync again');
      console.error('━'.repeat(60));
    } else if (error.message.includes('index')) {
      console.error('\n💡 Firebase error mentions "index" - likely missing index');
    } else {
      console.error('\nUnexpected error. Stack trace:');
      console.error(error);
    }
  } finally {
    process.exit(0);
  }
}

testFirebase();

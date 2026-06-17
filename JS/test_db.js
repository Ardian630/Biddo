const apikey = 'sb_publishable_RS1AQYXjj1pOy7WQsA4Dvw_kYH9WQg4';

async function test() {
    try {
        const res = await fetch('https://alefrqhoerxxebegxwrr.supabase.co/rest/v1/', {
            headers: {
                'apikey': apikey,
                'Authorization': `Bearer ${apikey}`,
                'Accept': 'application/openapi+json'
            }
        });
        const root = await res.json();
        console.log('Keys in root:', Object.keys(root));
        console.log('Exposed tables/paths:', Object.keys(root.paths || {}));
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

test();

// supabase/functions/create-staff/index.ts
//
// This runs on Supabase's servers, not in the browser — that's what lets it
// safely create a login for someone else. Only a signed-in Admin can call it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { name, username, password, role } = await req.json();

    if (!name || !username || !password || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), { status: 400 });
    }

    // Client using the caller's own token, just to check who's asking
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not signed in." }), { status: 401 });
    }

    const { data: callerStaff } = await callerClient
      .from("staff")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!callerStaff || callerStaff.role !== "Admin") {
      return new Response(JSON.stringify({ error: "Only an Admin can create staff accounts." }), { status: 403 });
    }

    // Admin client using the service role key — this is what can create logins
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const email = `${username}@palani.local`; // internal-only, staff still log in with a username

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Could not create login." }), { status: 400 });
    }

    const { error: staffError } = await adminClient.from("staff").insert({
      id: created.user.id,
      name,
      role,
    });

    if (staffError) {
      // Roll back the auth user if the staff row failed, so we don't leave an orphaned login
      await adminClient.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: staffError.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, id: created.user.id }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

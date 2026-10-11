// This Edge Function is deployed in Supabase under the name "quick-handler"
// (originally auto-named). It handles all staff account management that
// needs elevated (service role) privileges: creating logins, deactivating/
// reactivating them, and resetting passwords. Only a signed-in Admin can
// call any of these actions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const action = body.action || "create"; // default to "create" for backward compatibility

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not signed in." }, 401);

    const { data: callerStaff } = await callerClient.from("staff").select("role, active").eq("id", caller.id).single();
    if (!callerStaff || callerStaff.active !== true || callerStaff.role !== "Admin") {
      return json({ error: "Only an Admin can manage staff accounts." }, 403);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---------- CREATE ----------
    if (action === "create") {
      const { name, username, password, role } = body;
      if (!name || !username || !password || !role) {
        return json({ error: "Missing required fields." }, 400);
      }
      const email = `${username}@palani.local`;
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError || !created.user) {
        return json({ error: createError?.message ?? "Could not create login." }, 400);
      }
      const { error: staffError } = await adminClient.from("staff").insert({ id: created.user.id, name, role });
      if (staffError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return json({ error: staffError.message }, 400);
      }
      return json({ success: true, id: created.user.id });
    }

    // ---------- DEACTIVATE ----------
    if (action === "deactivate") {
      const { staffId } = body;
      if (!staffId) return json({ error: "Missing staffId." }, 400);
      await adminClient.auth.admin.updateUserById(staffId, { ban_duration: "876000h" }); // ~100 years
      const { error } = await adminClient.from("staff").update({ active: false }).eq("id", staffId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---------- REACTIVATE ----------
    if (action === "reactivate") {
      const { staffId } = body;
      if (!staffId) return json({ error: "Missing staffId." }, 400);
      await adminClient.auth.admin.updateUserById(staffId, { ban_duration: "none" });
      const { error } = await adminClient.from("staff").update({ active: true }).eq("id", staffId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---------- RESET PASSWORD ----------
    if (action === "reset_password") {
      const { staffId, newPassword } = body;
      if (!staffId || !newPassword) return json({ error: "Missing staffId or newPassword." }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(staffId, { password: newPassword });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

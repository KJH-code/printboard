const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigured = Boolean(url && publishableKey)
export const demoMode = !supabaseConfigured
export { url as supabaseUrl, publishableKey as supabasePublishableKey }

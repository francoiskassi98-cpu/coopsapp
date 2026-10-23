import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Plus, Send, Trash2, MessageSquare, Loader2, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Thread = { id: string; title: string; updated_at: string };
type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quel est le poids total livré pour la campagne en cours ?",
  "Quels sont les 10 producteurs avec le plus de potentiel restant ?",
  "Liste les 5 derniers chargements.",
  "Donne la répartition du potentiel par section.",
];

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ai-assistant`;

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(async () => {
    const { data, error } = await supabase.from("ai_chat_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(50);
    if (error) { console.error(error); return; }
    setThreads(data ?? []);
  }, []);

  useEffect(() => { if (open) loadThreads(); }, [open, loadThreads]);

  const skipLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId) { if (!skipLoadRef.current) setMessages([]); return; }
    if (skipLoadRef.current === activeId) { skipLoadRef.current = null; return; }
    let cancel = false;
    supabase.from("ai_chat_messages").select("id,role,content").eq("thread_id", activeId).order("created_at").then(({ data, error }) => {
      if (error) console.error(error);
      if (!cancel) setMessages((data ?? []) as Msg[]);
    });
    return () => { cancel = true; };
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (open && !busy) setTimeout(() => inputRef.current?.focus(), 50); }, [open, busy, activeId]);

  const newThread = () => { setActiveId(null); setMessages([]); setShowList(false); };

  const deleteThread = async (id: string) => {
    const { error } = await supabase.from("ai_chat_threads").delete().eq("id", id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    if (id === activeId) newThread();
    loadThreads();
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput("");
    let threadId = activeId;
    const asstId = crypto.randomUUID();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: question }, { id: asstId, role: "assistant", content: "" }]);
    try {
      if (!threadId) {
        const { data, error } = await supabase.from("ai_chat_threads").insert({ title: "Nouvelle discussion" }).select("id").single();
        if (error || !data) throw error ?? new Error("thread");
        threadId = data.id;
        skipLoadRef.current = threadId;
        setActiveId(threadId);
      }
      const { data: s } = await supabase.auth.getSession();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ threadId, question }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        const msg = res.status === 429 ? "Trop de demandes, réessayez dans un instant."
          : res.status === 402 ? "Crédits IA épuisés. Contactez l'administrateur."
          : err.error || "Une erreur est survenue.";
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: `⚠️ ${msg}` } : x)));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: acc } : x)));
      }
      if (!acc.trim()) setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: "⚠️ Aucune réponse n'a pu être générée." } : x)));
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") { console.error(e); toast.error("Une erreur est survenue."); }
    } finally {
      abortRef.current = null;
      setBusy(false);
      loadThreads();
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full shadow-glow bg-gradient-primary text-primary-foreground hover:scale-105 transition-transform"
        aria-label="Ouvrir l'assistant IA"
      >
        <Bot className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
          <SheetHeader className="p-4 border-b border-border space-y-1">
            <div className="flex items-center gap-2 pr-8">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base">Assistant Coops</SheetTitle>
                <SheetDescription className="text-xs">Questions sur vos chargements, producteurs et analyses</SheetDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowList((v) => !v)} aria-label="Historique">
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={newThread}><Plus className="h-4 w-4 mr-1" />Nouveau</Button>
            </div>
          </SheetHeader>

          {showList && (
            <div className="border-b border-border max-h-60 overflow-y-auto p-2 space-y-1 bg-muted/30">
              {threads.length === 0 && <p className="text-xs text-muted-foreground p-2">Aucune discussion.</p>}
              {threads.map((t) => (
                <div key={t.id} className={cn("flex items-center gap-1 rounded-md", t.id === activeId && "bg-accent")}>
                  <button className="flex-1 text-left text-sm px-2 py-1.5 truncate" onClick={() => { setActiveId(t.id); setShowList(false); }}>
                    {t.title}
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteThread(t.id)} aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Posez une question en langage naturel. Exemples :</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy}
                    className="block w-full text-left text-sm rounded-lg border border-border px-3 py-2 hover:bg-accent transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">{m.content}</div>
                ) : m.content ? (
                  <div className="max-w-full text-sm leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analyse des données…</div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="border-t border-border p-3 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ex : Combien de sacs livrés ce mois-ci ?"
              rows={2}
              maxLength={2000}
              disabled={busy}
              className="resize-none"
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" onClick={() => abortRef.current?.abort()} aria-label="Arrêter"><Square className="h-4 w-4" /></Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
            )}
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

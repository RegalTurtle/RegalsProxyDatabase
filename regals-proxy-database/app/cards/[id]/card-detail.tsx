"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ScryfallCard = {
  id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  cmc: number;
  colors?: string[];
  color_identity?: string[];
  set_name: string;
  collector_number: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
    };
  }[];
  prices?: {
    usd?: string | null;
  };
  scryfall_uri: string;
};

type ProxyDesign = {
  id: string;
  baseCardId: string;
  baseCardName: string;
  creator?: string;
  artist?: string;
  imageUrl: string;
  storageKey?: string;
  createdAt: string;
  displayOrder?: number;
};

async function readJsonResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();

  if (!text) {
    return { error: `${response.status} ${response.statusText || "Empty response"}` } as T & { error?: string };
  }

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: text } as T & { error?: string };
  }
}

function cardImage(card: ScryfallCard, size: "small" | "normal" | "large" = "normal") {
  return (
    card.image_uris?.[size] ??
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.[size] ??
    card.card_faces?.[0]?.image_uris?.normal ??
    ""
  );
}

function oracleText(card: ScryfallCard) {
  if (card.oracle_text) {
    return card.oracle_text;
  }

  return card.card_faces
    ?.map((face) => [face.name, face.oracle_text].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n\n");
}

function colorPips(card: ScryfallCard) {
  const colors = card.color_identity?.length ? card.color_identity : card.colors ?? [];

  if (!colors.length) {
    return ["C"];
  }

  return colors;
}

async function convertImageToJpeg(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare image conversion.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.9);
  });

  if (!blob) {
    throw new Error("Could not convert image to JPEG.");
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

export default function CardDetail({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [card, setCard] = useState<ScryfallCard | null>(null);
  const [proxies, setProxies] = useState<ProxyDesign[]>([]);
  const [showAllProxies, setShowAllProxies] = useState(false);
  const [previewProxy, setPreviewProxy] = useState<ProxyDesign | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const draggedProxy = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    if (previewProxy) previewDialog.current?.showModal();
  }, [previewProxy]);
  const [selectedProxy, setSelectedProxy] = useState<ProxyDesign | null>(null);
  const [status, setStatus] = useState("Loading card from Scryfall...");
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    creator: "",
    artist: "",
    imageUrl: "",
  });
  const [editForm, setEditForm] = useState({ creator: "", artist: "" });
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadCard = useCallback(async () => {
    setStatus("Loading card from Scryfall...");

    try {
      const response = await fetch(`/api/scryfall/cards/${cardId}`);
      const payload = (await response.json()) as ScryfallCard & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load that card.");
      }

      setCard(payload);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load that card.");
    }
  }, [cardId]);

  const loadProxies = useCallback(async () => {
    try {
      const response = await fetch(`/api/proxies?cardId=${encodeURIComponent(cardId)}`);
      const payload = (await response.json()) as {
        data?: ProxyDesign[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load proxies.");
      }

      setProxies(payload.data ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load proxies.");
    }
  }, [cardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCard();
    void loadProxies();
  }, [loadCard, loadProxies]);

  async function reorderProxy(targetId: string) {
    const sourceId = draggedProxy.current;
    draggedProxy.current = null;
    setDropTarget(null);
    if (!sourceId || sourceId === targetId || isSavingOrder) return;
    const from = proxies.findIndex((proxy) => proxy.id === sourceId);
    const to = proxies.findIndex((proxy) => proxy.id === targetId);
    if (from < 0 || to < 0) return;
    const previous = proxies;
    const reordered = [...proxies];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    setProxies(reordered);
    setIsSavingOrder(true);
    try {
      const response = await fetch("/api/proxies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCardId: cardId, proxyIds: reordered.map((proxy) => proxy.id) }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Could not save proxy order.");
      }
      setStatus("Saved proxy order.");
    } catch (error) {
      setProxies(previous);
      setStatus(error instanceof Error ? error.message : "Could not save proxy order.");
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function addProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!card) {
      setStatus("The card is still loading.");
      return;
    }

    if (!file && !form.imageUrl.trim()) {
      setStatus("Choose an image file for R2, or paste an existing proxy image URL.");
      return;
    }

    setIsAdding(true);
    setStatus(file ? "Uploading proxy art to R2..." : "Adding proxy design...");

    try {
      let imageUrl = form.imageUrl.trim();
      let storageKey: string | undefined;

      if (file) {
        const jpegFile = await convertImageToJpeg(file);
        const uploadBody = new FormData();
        uploadBody.append("file", jpegFile);
        uploadBody.append("cardName", card.name);

        const response = await fetch("/api/proxies/upload", {
          method: "POST",
          body: uploadBody,
        });
        const payload = await readJsonResponse<{
          imageUrl?: string;
          key?: string;
        }>(response);

        if (!response.ok || !payload.imageUrl) {
          throw new Error(payload.error ?? "R2 upload failed.");
        }

        imageUrl = payload.imageUrl;
        storageKey = payload.key;
      }

      const response = await fetch("/api/proxies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseCardId: card.id,
          baseCardName: card.name,
          creator: form.creator.trim() || "Unknown creator",
          artist: form.artist.trim() || "Unknown artist",
          imageUrl,
          storageKey,
        }),
      });
      const payload = (await response.json()) as {
        data?: ProxyDesign;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Could not save proxy record.");
      }

      setProxies((current) => [...current, payload.data as ProxyDesign]);
      setShowAllProxies(true);
      setSelectedProxy(payload.data);
      setEditForm({
        creator: payload.data.creator ?? "Unknown creator",
        artist: payload.data.artist ?? "Unknown artist",
      });
      setForm({ creator: "", artist: "", imageUrl: "" });
      setFile(null);
      setStatus(`Added a proxy for "${payload.data.baseCardName}" to your archive.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add that proxy.");
    } finally {
      setIsAdding(false);
    }
  }

  async function updateProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProxy) {
      return;
    }

    setIsSavingEdit(true);

    try {
      const response = await fetch(`/api/proxies?id=${encodeURIComponent(selectedProxy.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = (await response.json()) as { data?: ProxyDesign; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Could not update proxy.");
      }

      const updatedProxy = payload.data;
      setProxies((current) => current.map((proxy) => (proxy.id === updatedProxy.id ? updatedProxy : proxy)));
      setSelectedProxy(updatedProxy);
      setStatus("Updated proxy credits.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update proxy.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function removeProxy(proxyId: string) {
    try {
      const response = await fetch(`/api/proxies?id=${encodeURIComponent(proxyId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete proxy.");
      }

      setProxies((current) => current.filter((proxy) => proxy.id !== proxyId));
      setSelectedProxy(null);
      setStatus("Removed proxy design from MongoDB.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete proxy.");
    }
  }

  function chooseDroppedFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);

    const droppedFile = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));

    if (!droppedFile) {
      setStatus("Drop an image file to upload.");
      return;
    }

    setFile(droppedFile);
    setStatus("");
  }

  function searchFromCardPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchQuery.trim();
    router.push(trimmed ? '/?q=' + encodeURIComponent(trimmed) : '/');
  }

  return (
    <main className="min-h-screen">
      <div className="scryfall-shell min-h-screen">
        <header className="scryfall-header">
          <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-2 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <Link className="brand-mark" href="/">
                <span className="brand-orb">R</span>
                <span>Regal&apos;s Proxy Database</span>
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link className="nav-link" href="/">
                  Search
                </Link>
                <Link className="nav-link" href="/universes-beyond">
                  Universes Beyond
                </Link>
              </div>
            </div>
            <form className="scryfall-search" onSubmit={searchFromCardPage}>
              <input
                className="search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder='Search for Magic cards...'
              />
              <button className="primary-button">
                Search
              </button>
            </form>
          </div>
        </header>

        <section className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <Link className="back-link" href="/">
            Back to search
          </Link>

          {card ? (
            <div className="card-page-layout">
              <div className="card-main-row">
                <div className="card-art-column">
                  <img src={cardImage(card, "large")} alt={card.name} className="detail-card-image" />
                </div>

                <div className="detail-panel card-info-panel">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="detail-title">{card.name}</h1>
                      <p className="mt-1 text-sm opacity-75">{card.type_line}</p>
                    </div>
                    <div className="flex gap-1">
                      {colorPips(card).map((color) => (
                        <span key={color} className="mana-pip">
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <p className="oracle-text">{oracleText(card)}</p>
                    <div className="card-facts">
                      <span>Set: {card.set_name}</span>
                      <span>No. {card.collector_number}</span>
                      <span>MV {card.cmc}</span>
                      <span>{card.prices?.usd ? `$${card.prices.usd}` : "No price"}</span>
                    </div>
                    <a className="secondary-button inline-flex" href={card.scryfall_uri} target="_blank">
                      Open Scryfall
                    </a>
                  </div>
                </div>
              </div>

              <section className="detail-panel proxy-panel">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="section-title">Proxies ({proxies.length})</h2>
                </div>

                <div id="proxy-gallery" className="proxy-gallery">
                  {(showAllProxies ? proxies : proxies.slice(0, 5)).map((proxy) => (
                    <button
                      key={proxy.id}
                      type="button"
                      className={selectedProxy?.id === proxy.id ? "proxy-card selected" : "proxy-card"}
                      data-drop-target={dropTarget === proxy.id || undefined}
                      draggable={!isSavingOrder && !isAdding}
                      onDragStart={(event) => {
                        draggedProxy.current = proxy.id;
                        suppressClick.current = true;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", proxy.id);
                      }}
                      onDragOver={(event) => {
                        if (!draggedProxy.current || isSavingOrder) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTarget(proxy.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void reorderProxy(proxy.id);
                      }}
                      onDragEnd={() => {
                        draggedProxy.current = null;
                        setDropTarget(null);
                        setTimeout(() => { suppressClick.current = false; }, 0);
                      }}
                      onClick={() => {
                        if (suppressClick.current) return;
                        if (selectedProxy?.id === proxy.id) {
                          setPreviewProxy(proxy);
                          return;
                        }
                        setSelectedProxy(proxy);
                        setEditForm({ creator: proxy.creator ?? "Unknown creator", artist: proxy.artist ?? "Unknown artist" });
                      }}
                    >
                      <img src={proxy.imageUrl} alt={`${proxy.baseCardName} proxy`} className="proxy-image" loading="lazy" draggable={false} />
                      <span className="block p-3 text-left">
                        <span className="block font-semibold">{proxy.baseCardName}</span>
                        <span className="block text-sm opacity-75">
                          by {proxy.creator ?? "Unknown creator"}; art by {proxy.artist ?? "Unknown artist"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {proxies.length > 5 && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      className="secondary-button gap-2"
                      aria-expanded={showAllProxies}
                      aria-controls="proxy-gallery"
                      onClick={() => setShowAllProxies((current) => !current)}
                    >
                      {showAllProxies ? "Show less" : `Show more (${proxies.length - 5})`}
                      <span aria-hidden="true">{showAllProxies ? "▴" : "▾"}</span>
                    </button>
                  </div>
                )}

                <p className="mt-3 text-xs opacity-75" role="status">
                  {isSavingOrder ? "Saving proxy order…" : "Drag proxies to reorder and set the default image. Click a proxy to edit its credits; click it again to enlarge it."}
                </p>

                {selectedProxy && (
                  <div className="selected-proxy-note">
                    <div className="flex items-start justify-between gap-3">
                      <p>{selectedProxy.baseCardName} proxy by {selectedProxy.creator ?? "Unknown creator"}; art by {selectedProxy.artist ?? "Unknown artist"}.</p>
                      <button className="danger-button" disabled={isSavingOrder} onClick={() => void removeProxy(selectedProxy.id)}>
                        Remove
                      </button>
                    </div>
                    {selectedProxy.storageKey && (
                      <p className="mt-2 break-all text-xs opacity-70">R2 key: {selectedProxy.storageKey}</p>
                    )}
                    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={updateProxy}>
                      <input
                        className="field"
                        value={editForm.creator}
                        onChange={(event) => setEditForm((current) => ({ ...current, creator: event.target.value }))}
                        placeholder="Creator"
                        aria-label="Creator"
                        required
                      />
                      <input
                        className="field"
                        value={editForm.artist}
                        onChange={(event) => setEditForm((current) => ({ ...current, artist: event.target.value }))}
                        placeholder="Artist"
                        aria-label="Artist"
                        required
                      />
                      <button className="primary-button sm:col-span-2" disabled={isSavingEdit}>
                        {isSavingEdit ? "Saving" : "Save credits"}
                      </button>
                    </form>
                  </div>
                )}

                <form className="proxy-add-form" onSubmit={addProxy}>
                  <input
                    className="field"
                    value={form.creator}
                    onChange={(event) => setForm((current) => ({ ...current, creator: event.target.value }))}
                    placeholder="Creator"
                  />
                    <input
                      className="field"
                      value={form.artist}
                      onChange={(event) => setForm((current) => ({ ...current, artist: event.target.value }))}
                      placeholder="Artist"
                    />
                  <label
                    className={isDraggingUpload ? "upload-box dragging" : "upload-box"}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDraggingUpload(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      setIsDraggingUpload(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        return;
                      }

                      setIsDraggingUpload(false);
                    }}
                    onDrop={chooseDroppedFile}
                  >
                    <span>{file ? file.name : "Choose or drop proxy image for R2"}</span>
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <input
                    className="field"
                    value={form.imageUrl}
                    onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    placeholder="Or paste an existing proxy image URL"
                  />
                  <button className="primary-button" disabled={isAdding || isSavingOrder}>
                    {isAdding ? "Saving" : "Add proxy"}
                  </button>
                </form>
              </section>
            </div>
          ) : (
            <div className="detail-panel mt-4">
              <h1 className="detail-title">Loading card</h1>
              <p className="mt-3 text-sm opacity-75">{status}</p>
            </div>
          )}

          {card && status && <p className="results-status mt-4">{status}</p>}
        </section>
      </div>
      <dialog
        ref={previewDialog}
        className="proxy-preview-dialog"
        aria-label={previewProxy ? `${previewProxy.baseCardName} proxy preview` : "Proxy preview"}
        onClose={() => setPreviewProxy(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) previewDialog.current?.close();
        }}
      >
        {previewProxy && (
          <div className="proxy-preview-content">
            <button type="button" className="secondary-button" autoFocus onClick={() => previewDialog.current?.close()}>
              Close
            </button>
            <img src={previewProxy.imageUrl} alt={`${previewProxy.baseCardName} proxy`} className="proxy-preview-image" />
            <p>{previewProxy.baseCardName} — by {previewProxy.creator ?? "Unknown creator"}; art by {previewProxy.artist ?? "Unknown artist"}</p>
          </div>
        )}
      </dialog>
    </main>
  );
}

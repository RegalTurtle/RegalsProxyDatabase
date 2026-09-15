"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { DragEvent, FormEvent, useCallback, useEffect, useState } from "react";

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
};

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
  const [card, setCard] = useState<ScryfallCard | null>(null);
  const [proxies, setProxies] = useState<ProxyDesign[]>([]);
  const [showAllProxies, setShowAllProxies] = useState(false);
  const [selectedProxy, setSelectedProxy] = useState<ProxyDesign | null>(null);
  const [status, setStatus] = useState("Loading card from Scryfall...");
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    creator: "",
    imageUrl: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);

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
        const payload = (await response.json()) as {
          imageUrl?: string;
          key?: string;
          error?: string;
        };

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

      setProxies((current) => [payload.data as ProxyDesign, ...current]);
      setSelectedProxy(payload.data);
      setForm({ creator: "", imageUrl: "" });
      setFile(null);
      setStatus(`Added a proxy for "${payload.data.baseCardName}" to your archive.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add that proxy.");
    } finally {
      setIsAdding(false);
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

  return (
    <main className="min-h-screen">
      <div className="scryfall-shell min-h-screen">
        <header className="scryfall-header">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
            <Link className="brand-mark" href="/">
              <span className="brand-orb">R</span>
              <span>Regal&apos;s Proxy Database</span>
            </Link>
            <Link className="nav-link" href="/">
              Search
            </Link>
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
                      className={selectedProxy?.id === proxy.id ? "proxy-card selected" : "proxy-card"}
                      onClick={() => setSelectedProxy(proxy)}
                    >
                      <img src={proxy.imageUrl} alt={`${proxy.baseCardName} proxy`} className="proxy-image" loading="lazy" />
                      <span className="block p-3 text-left">
                        <span className="block font-semibold">{proxy.baseCardName}</span>
                        <span className="block text-sm opacity-75">by {proxy.creator ?? proxy.artist ?? "Unknown creator"}</span>
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

                {selectedProxy && (
                  <div className="selected-proxy-note">
                    <div className="flex items-start justify-between gap-3">
                      <p>{selectedProxy.baseCardName} proxy by {selectedProxy.creator ?? selectedProxy.artist ?? "Unknown creator"}.</p>
                      <button className="danger-button" onClick={() => void removeProxy(selectedProxy.id)}>
                        Remove
                      </button>
                    </div>
                    {selectedProxy.storageKey && (
                      <p className="mt-2 break-all text-xs opacity-70">R2 key: {selectedProxy.storageKey}</p>
                    )}
                  </div>
                )}

                <form className="proxy-add-form" onSubmit={addProxy}>
                  <input
                    className="field"
                    value={form.creator}
                    onChange={(event) => setForm((current) => ({ ...current, creator: event.target.value }))}
                    placeholder="Creator"
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
                  <button className="primary-button" disabled={isAdding}>
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
    </main>
  );
}

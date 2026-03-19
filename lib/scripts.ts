
import { SCRIPT_METADATA } from './script-metadata';

interface Script {
  id: string;
  name: string;
  scriptUrl: string;
  status: 'Working' | 'Discontinued';
  type: 'Free' | 'Premium' | 'Discontinued';
  universeId?: string;
  displayType?: string;
  additionalUrls?: { url: string; type: string }[];
  description?: string;
  features?: string[];
}

export async function fetchScripts(): Promise<Script[]> {
  try {
    const [freeRes, premiumRes, discontinuedRes] = await Promise.all([
      fetch('https://raw.githubusercontent.com/Ken-884/roblox/refs/heads/main/gamelist.lua', { next: { revalidate: 3600 } }),
      fetch('https://raw.githubusercontent.com/Ken-884/roblox/refs/heads/main/premium/gamelist.lua', { next: { revalidate: 3600 } }),
      fetch('https://raw.githubusercontent.com/Ken-884/roblox/refs/heads/main/discontinued.lua', { next: { revalidate: 60 } })
    ]);

    const [freeCode, premiumCode, discontinuedCode] = await Promise.all([
      freeRes.text(),
      premiumRes.text(),
      discontinuedRes.text()
    ]);

    const discontinuedIds = parseDiscontinuedList(discontinuedCode);
    const freeGames = parseLuaGameList(freeCode, 'Free');
    const premiumGames = parseLuaGameList(premiumCode, 'Premium');

    // Merge logic
    const gamesByUrl = new Map<string, Script>();
    const gamesByName = new Map<string, Script>();

    // Process Free
    freeGames.forEach(game => {
      if (discontinuedIds.has(game.id)) {
        game.type = 'Discontinued';
        game.status = 'Discontinued';
      }
      gamesByUrl.set(game.scriptUrl, game);
    });

    // Process Premium
    premiumGames.forEach(game => {
      if (gamesByUrl.has(game.scriptUrl)) return; // Skip duplicate URLs

      if (discontinuedIds.has(game.id)) {
        game.type = 'Discontinued';
        game.status = 'Discontinued';
      }
      gamesByUrl.set(game.scriptUrl, game);
    });

    // Fetch metadata from database
    let metadataMap: Record<string, { description: string; features: string[] }> = {};
    try {
      const { supabase } = await import('./server/db');
      const { data: metadataData } = await supabase
        .from('script_metadata')
        .select('*');
      
      if (metadataData) {
        metadataData.forEach((item: any) => {
          metadataMap[item.script_name] = {
            description: item.description,
            features: item.features || []
          };
        });
      }
    } catch (error) {
      console.error('Error fetching metadata from database:', error);
    }

    // Combine by Name and Merge Metadata
    Array.from(gamesByUrl.values()).forEach(game => {
      // Lookup Metadata from database
      const metadata = metadataMap[game.name];
      if (metadata) {
        game.description = metadata.description;
        game.features = metadata.features;
      }

      if (gamesByName.has(game.name)) {
        const existing = gamesByName.get(game.name)!;
        if (!existing.additionalUrls) existing.additionalUrls = [];
        existing.additionalUrls.push({ url: game.scriptUrl, type: game.type });
        
        if (game.type === 'Premium' && existing.type === 'Free') {
          existing.displayType = 'Free & Premium';
        }
        // Merge metadata into existing if it was missing (e.g., from the second variant)
        if (!existing.description && game.description) {
           existing.description = game.description;
           existing.features = game.features;
        }

      } else {
        const gameCopy = { ...game, displayType: game.type };
        gamesByName.set(game.name, gameCopy);
      }
    });

    return Array.from(gamesByName.values());

  } catch (error) {
    console.error('Failed to fetch scripts:', error);
    return [];
  }
}

function parseDiscontinuedList(luaCode: string): Set<string> {
  const ids = new Set<string>();
  const regex = /\["(\d+)"\]\s*=\s*true/g;
  let match;
  while ((match = regex.exec(luaCode)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

function parseLuaGameList(luaCode: string, type: 'Free' | 'Premium'): Script[] {
  const games: Script[] = [];
  const lines = luaCode.split('\n');
  let currentComment = '';

  for (const line of lines) {
    const commentMatch = line.match(/--\s*(.+)/);
    if (commentMatch) {
      currentComment = commentMatch[1].trim();
    }

    const entryMatch = line.match(/\["(\d+)"\]\s*=\s*"([^"]+)"/);
    if (entryMatch) {
      const id = entryMatch[1];
      const scriptUrl = entryMatch[2];
      
      let name = currentComment;
      if (!name) {
        const nameMatch = scriptUrl.match(/Script_([^.]+)\.lua/);
        name = nameMatch ? nameMatch[1].replace(/([A-Z])/g, " $1").trim() : "Unknown Game";
      }

      games.push({
        id,
        name,
        scriptUrl,
        status: 'Working',
        type,
        universeId: id
      });
      currentComment = '';
    }
  }
  return games;
}

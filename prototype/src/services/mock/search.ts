import type { SearchService } from '../contracts';
import { searchBank } from '../../data/searchBank';

/** Simulated search: a fixed bank, delayed to look like a network call. It does not touch the network. */
export function createSearchService(): SearchService {
  return {
    query: (text) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(text.trim() ? searchBank(text) : []), 700);
      }),
  };
}

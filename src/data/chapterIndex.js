import { BOOKS } from "./books";

// Flat, canonical-order list of every chapter in the Bible plus one intro cell
// per book (1,189 chapters + 66 intro cells = 1,255 total items).
// Each book's intro cell comes first (isIntroCell: true), followed by chapters
// 1 through N as normal numbered cells.
export const ALL_CHAPTERS = BOOKS.flatMap((book, bookIndex) => [
  // Intro cell — shows book abbreviation, opens the book intro screen.
  {
    bookId: book.id,
    bookName: book.name,
    chapterNumber: 0,
    isFirstOfBook: true,
    isIntroCell: true,
    bookIndexParity: bookIndex % 2,
  },
  // Regular chapter cells.
  ...Array.from({ length: book.chapterCount }, (_, i) => ({
    bookId: book.id,
    bookName: book.name,
    chapterNumber: i + 1,
    isFirstOfBook: false,
    isIntroCell: false,
    bookIndexParity: bookIndex % 2,
  })),
]);

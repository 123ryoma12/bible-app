import { BOOKS } from "./books";

// Flat, canonical-order list of every chapter in the Bible (1,189 total),
// Genesis 1 through Revelation 22. Used by the Stats bar chart to render one
// bar per chapter in reading order.
export const ALL_CHAPTERS = BOOKS.flatMap((book, bookIndex) =>
  Array.from({ length: book.chapterCount }, (_, i) => ({
    bookId: book.id,
    bookName: book.name,
    chapterNumber: i + 1,
    isFirstOfBook: i === 0,
    bookIndexParity: bookIndex % 2,
  }))
);

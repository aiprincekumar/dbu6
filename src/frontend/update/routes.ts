/*
 * Update's URL: where the books stand and the one thing to do to bring them
 * up to date.
 */

export const UPDATE_ROUTE = "/update";

/**
 * The run's drop on Update (`DoMyBooks`), the element's id: arriving at
 * `/update#drop` scrolls to it and focuses its "Choose files", so a link
 * that asks for statements lands on where they go.
 */
export const DROP_ID = "drop";

export const UPDATE_DROP_HREF = `${UPDATE_ROUTE}#${DROP_ID}`;

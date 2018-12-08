class NumberWrapper {
    constructor(public x: number) {
    }
}

let n = new NumberWrapper(1);

let div: HTMLDivElement = document.createElement("div");
div.innerText = `Typescript worked! NumberWrapper ${n.x}`;
document.body.appendChild(div);
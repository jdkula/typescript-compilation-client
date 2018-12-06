/** Represents the contents of a single TypeScript script. */
interface TSFile {
    name: string
    content: string
}

/** Represents the output of a TypeScript compilation */
interface TSOutput {
    success: boolean
    result: string
    files: Array<TSFile>
}

/** Represents a TypeScript program to be compiled. */
interface TSProgram {
    files: Array<TSFile>
}

/** Represents a fatal error in running the TypeScript compiler. */
interface TSError {
    error: boolean
    reason: string
}

/** Represents a configuration for the compiler API */
interface TSCompilerConfiguration {
    server: string
    tsScriptType: string
    tsconfigType: string
    outputJsType: string
    outputOtherType: string
}

/** Hides the status spinner. */
function hideSpinner() {
    let spinner = document.getElementById("spinner");
    if (spinner !== null) {
        spinner.setAttribute("class", "hidden");
    }
}

/** Sets the status text. */
function setStatus(status: string) {
    let statusDom = document.getElementById("status");
    if (statusDom !== null) {
        statusDom.innerText = status;
        statusDom.setAttribute("class", "header");
    }
}

/** Adds an element in the status contianer. */
function addNote(note: string, error: boolean = false) {
    let container = document.getElementById("status-container");
    if(container !== null) {
        let noteElem = document.createElement("pre");
        if(error) {
            noteElem.setAttribute("class", "error")
        }
        noteElem.innerText = note;
        container.appendChild(noteElem);
    }
}

/** Hides the status text. */
function hideStatus() {
    let statusDom = document.getElementById("status");
    if (statusDom !== null) {
        statusDom.innerText = status;
        statusDom.setAttribute("class", "header hidden");
    }
}

/** Sets the status text, and highlights it red. */
function setError(status: string) {
    let statusDom = document.getElementById("status");
    if (statusDom !== null) {
        statusDom.innerText = status;
        statusDom.setAttribute("class", "header error");
    }
}

class Compiler {
    constructor(private server: string,
                private tsScriptType: string,
                private tsconfigType: string,
                private outputJsType: string,
                private outputOtherType: string
    ) {
    }

    /**
     * Locates all typescript and tsconfig scripts as defined
     * in the constructor, and sends them to the server to compile them.
     * Then, it executes the compiled scripts.
     */
    compile() {
        let xhr = new XMLHttpRequest();
        xhr.open("POST", `${this.server}/compile`);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onload = () => {
            try {
                let output: TSOutput & TSError = JSON.parse(xhr.responseText);
                if (output.error) {
                    setError(`A server error occurred: <br/> ${output.reason}`);
                    hideSpinner();
                }
                this.showOutput(output as TSOutput)
            } catch (e) {
                setError("A server error occurred.");
                hideSpinner();
            }
        };

        xhr.onerror = () => {
            setError("A server error occurred.");
            hideSpinner();
        };

        this.readScripts((program: TSProgram) => {
            xhr.send(JSON.stringify(program));
        });

    }

    /** Given a compiled TSFile, adds it to the DOM to execute it. */
    private addScript(file: TSFile) {
        let scriptElement = document.createElement("script");
        let type = document.createAttribute("type");
        if (file.name.lastIndexOf(".js") === file.name.length - 3) {  // ends with .js
            type.value = this.outputJsType;
        } else {
            type.value = this.outputOtherType;
        }
        scriptElement.attributes.setNamedItem(type);
        scriptElement.innerHTML = file.content;
        document.body.appendChild(scriptElement);
    }

    /**
     * Given the [output] of a compilation, gives information
     * about its result to the user and, if applicable, adds
     * all scripts to the DOM to execute them.
     */
    private showOutput(output: TSOutput) {
        let fragment = document.createRange().createContextualFragment(output.result);
        let inner = fragment.querySelector("pre")!;  // Extracts compilation info from the compilation result.
        let div = document.createElement("div");
        div.setAttribute("style", "color: #FFF; background-color: #000;");
        div.appendChild(inner);
        let container = document.getElementById("status-container");
        if (container !== null) {
            container.appendChild(div);
        } else {
            document.body.insertBefore(div, document.body.firstChild);
        }

        if (!output.success) {
            setError("Compilation failed.");
            hideSpinner();
            return;
        } else {
            hideStatus();
            hideSpinner();
        }

        for (let file of output.files) {
            this.addScript(file);
        }
    }

    /**
     * Used with the readScripts function. Fills in [files] with
     * TSFiles constructed from the given [script] and file [name].
     * If the [script] element is nonlocally located (i.e. has
     * a src attribute), queues an XHR to get that information
     * and stores it in [xhrs]. When all XHRs have finished
     * (as indicated by the values stored in [waitingXHRsRef]),
     * the [callback] is called.
     */
    private readScript(waitingXHRsRef: { n: number, called: boolean },
                       xhrs: Array<XMLHttpRequest>,
                       files: Array<TSFile>,
                       name: string,
                       script: HTMLScriptElement,
                       callback: (p: TSProgram) => void
    ) {
        let src = script.getAttribute("src"); // Gets the script's source...
        if (src === null) {  // ...and if it doesn't have one, just grab its source.
            files.push({
                name: name,
                content: script.innerHTML
            })
        } else {  // ...otherwise, prepare an XMLHttpRequest.
            waitingXHRsRef.n++;

            let xhr = new XMLHttpRequest();

            xhr.open("GET", src);
            xhr.onload = () => {

                files.push({
                    name: name,
                    content: xhr.responseText
                });

                waitingXHRsRef.n--;
                if (waitingXHRsRef.n === 0 && !waitingXHRsRef.called) {
                    callback({files: files})
                }
            };

            xhrs.push(xhr);
        }
    }

    /**
     * Reads all scripts from the document. When all scripts have been
     * read or retrieved as required, the [callback] is invoked.
     */
    private readScripts(callback: (p: TSProgram) => void): void {
        let scripts = document.querySelectorAll(`script[type="${this.tsScriptType}"]`);
        let config = document.querySelector(`script[type="${this.tsconfigType}"]`);
        if(config === null) {
            addNote("TypeScript config not found... compilation is very unlikely to succeed.", true)
        }
        let files: Array<TSFile> = [];
        let scriptNumber = 0;
        let waitingXHRsRef = {n: 0, called: false};

        let xhrs: Array<XMLHttpRequest> = [];

        for (let i = 0; i < scripts.length; i++) {
            let name = (scripts.item(i) as HTMLScriptElement).src;
            name = name.substring(name.lastIndexOf("/"));  // Get the last path element as the name.
            if (name == "") name = `script-${scriptNumber}.ts`;
            this.readScript(waitingXHRsRef,
                xhrs,
                files,
                name,
                scripts.item(i) as HTMLScriptElement,
                callback
            );
            scriptNumber++;
        }

        if (config !== null) {
            this.readScript(waitingXHRsRef, xhrs, files, "tsconfig.json", config as HTMLScriptElement, callback);
        }

        for (let xhr of xhrs) {
            xhr.send();
        }

        if (waitingXHRsRef.n === 0 && !waitingXHRsRef.called) {
            callback({files: files})
        }
    }

    /** Provides static access to configure the compiler in the HTML file. */
    private static instance: Compiler | null = null;

    /** Configures the static instance with the given [options]. */
    static configure(options: TSCompilerConfiguration) {
        this.instance = new Compiler(options.server, options.tsScriptType, options.tsconfigType, options.outputJsType, options.outputOtherType);
    }

    /** Compiles all the applicable scripts in the DOM. */
    static compile() {
        if (this.instance != null) {
            this.instance.compile();
        } else {
            console.error("Tried to compile before confiuring!")
        }
    }
}


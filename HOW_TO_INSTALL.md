# Setting up dev tools

You need to install `node`, `npm*`, `git`.
And I suggest to use `ìTerm`, a nice Terminal program.

## 1. Install Homebrew

 Install Homebrew (Apple Silicon) and set up your shell environment

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Add Homebrew to your PATH 
(the installer will show the exact commands)

```
follow the step shown by brew
```

## 2. Install GIT (if not already installed via macOS)

Install the GIT command line tool
```shell
brew install git
```

## 3. Download the repo and unpack it

 -> Download the package, (insert image here)

Go to the place where you want to have the folder
```shell
cd
cd Documents
```

## 4. Install Node.js

```shell
brew install node
brew upgrade node
```

Install project dependencies (example for a Node project)

```shell
npm install
```

If you need to switch Node versions later, consider using a local tool other than nvm (e.g., Homebrew-managed Node, or a project-specific installer). This guide avoids nvm as requested.

Then you can continue with the config: [README.md](./README.md)

### 5. Updates  – most likely not needed

```shell
npm install -g npm@latest
```

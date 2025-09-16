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

## 2. Install iTerm (optional, but a sign of good taste)

Install iTerm2 via Homebrew Cask:

``` shell
brew install --cask iterm2
```

Now open iterm and continue there:

```
[CMD + Space] -> iTerm
```


## 3. Install GIT (if not already installed via macOS)

Install the GIT command line tool
```shell
brew install git
```

## 4. Download the repo and unpack it

[ insert image ]

Go to the place where you want to have the folder
```shell
cd
cd Documents
```

## 5. Install Node.js without nvm (via Homebrew)

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

### 6. Updates  – just in case

```shell
npm install -g npm@latest
```
